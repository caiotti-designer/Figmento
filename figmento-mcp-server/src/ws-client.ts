import WebSocket from 'ws';
import { WSCommand, WSResponse } from './types';

interface PendingCommand {
  resolve: (response: WSResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface QueuedCommand {
  action: string;
  params: Record<string, unknown>;
  resolve: (response: WSResponse) => void;
  reject: (error: Error) => void;
  id: string;
}

/**
 * WebSocket client that connects to the Figmento relay server.
 * Sends commands to the Figma plugin and receives responses.
 *
 * Features:
 * - Auto-reconnect with exponential backoff (S-04)
 * - Command queue with idempotency tracking during reconnection (S-05)
 * - Heartbeat ping/pong to detect silent disconnections (S-06)
 */
export class FigmentoWSClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private channel: string = '';
  private connected: boolean = false;
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private commandCounter: number = 0;

  // S-04: Reconnection state
  private reconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect: boolean = false;
  private static readonly MAX_RECONNECT_ATTEMPTS = 10;
  private static readonly MAX_BACKOFF_MS = 30000;

  // S-05: Command queue and idempotency
  private replayQueue: Map<string, QueuedCommand> = new Map();
  private acknowledgedIds: Set<string> = new Set();
  private static readonly MAX_QUEUE_SIZE = 50;

  // S-06: Heartbeat
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly HEARTBEAT_INTERVAL_MS = 15000;
  private static readonly HEARTBEAT_TIMEOUT_MS = 5000;

  get isConnected(): boolean {
    return this.connected;
  }

  get currentChannel(): string {
    return this.channel;
  }

  /**
   * Connect to the relay server and join a channel.
   */
  connect(url: string, channel: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.url = url;
      this.channel = channel;
      this.intentionalDisconnect = false;

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(new Error(`Failed to create WebSocket connection: ${(err as Error).message}`));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout (10s)'));
        this.ws?.close();
      }, 10000);

      this.ws.on('open', () => {
        this.ws!.send(JSON.stringify({ type: 'join', channel }));
      });

      this.ws.on('message', (raw: Buffer) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (msg.type === 'joined') {
          clearTimeout(timeout);
          this.connected = true;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
          return;
        }

        if (msg.type === 'response') {
          const id = msg.id as string;
          this.acknowledgedIds.add(id);
          this.replayQueue.delete(id);

          const pending = this.pendingCommands.get(id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingCommands.delete(id);
            pending.resolve(msg as unknown as WSResponse);
          }
          return;
        }

        if (msg.type === 'error') {
          console.error(`[WS] Relay error: ${msg.error}`);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.stopHeartbeat();

        if (!this.intentionalDisconnect) {
          // Don't reject pending commands immediately — they stay in replayQueue
          // Clear timers to prevent spurious timeout rejections
          for (const [, pending] of this.pendingCommands) {
            clearTimeout(pending.timer);
          }
          // Note: we don't reject/delete pendingCommands here — they'll be
          // resolved when the replay succeeds or rejected if reconnect fails

          this.attemptReconnect();
        } else {
          // Intentional disconnect: reject all pending
          for (const [id, pending] of this.pendingCommands) {
            clearTimeout(pending.timer);
            pending.reject(new Error('WebSocket connection closed'));
            this.pendingCommands.delete(id);
          }
          // Reject queued commands too
          for (const [, queued] of this.replayQueue) {
            queued.reject(new Error('WebSocket connection closed'));
          }
          this.replayQueue.clear();
        }
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        if (!this.connected) {
          reject(new Error(`WebSocket error: ${err.message}`));
        }
      });
    });
  }

  /**
   * Disconnect from the relay server. Prevents auto-reconnect.
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnecting = false;
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.channel = '';
    this.acknowledgedIds.clear();
    this.replayQueue.clear();
  }

  /**
   * Send a command to the Figma plugin and wait for a response.
   */
  sendCommand(action: string, params: Record<string, unknown>, timeoutMs: number = 30000): Promise<WSResponse> {
    return new Promise((resolve, reject) => {
      const id = `cmd-${++this.commandCounter}-${Date.now()}`;

      if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        if (this.reconnecting) {
          // S-05: Buffer for replay after reconnect
          if (this.replayQueue.size >= FigmentoWSClient.MAX_QUEUE_SIZE) {
            reject(new Error('Command queue full. Connection lost and too many pending commands.'));
            return;
          }
          this.replayQueue.set(id, { action, params, resolve, reject, id });
          console.error(`[WS] Queued command ${id} (${action}) for replay after reconnect`);
          return;
        }
        reject(new Error('Not connected to Figma. Use connect_to_figma tool first.'));
        return;
      }

      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command timeout after ${timeoutMs}ms: ${action}`));
      }, timeoutMs);

      this.pendingCommands.set(id, { resolve, reject, timer });

      // Also add to replay queue in case connection drops before response
      this.replayQueue.set(id, { action, params, resolve, reject, id });

      const command: WSCommand = {
        type: 'command',
        id,
        channel: this.channel,
        action,
        params,
      };

      this.ws.send(JSON.stringify(command));
    });
  }

  // ═══════════════════════════════════════════════════════════
  // S-04: Reconnection with exponential backoff
  // ═══════════════════════════════════════════════════════════

  private attemptReconnect(): void {
    if (this.reconnecting || this.intentionalDisconnect || !this.url || !this.channel) {
      return;
    }

    if (this.reconnectAttempts >= FigmentoWSClient.MAX_RECONNECT_ATTEMPTS) {
      console.error(`[WS] Max reconnect attempts (${FigmentoWSClient.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
      this.rejectAllPending('Max reconnect attempts reached. Connection lost.');
      return;
    }

    this.reconnecting = true;
    const backoff = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      FigmentoWSClient.MAX_BACKOFF_MS
    );
    this.reconnectAttempts++;

    console.error(`[WS] Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts}/${FigmentoWSClient.MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(this.url, this.channel);
        console.error(`[WS] Reconnected successfully`);
        this.replayQueuedCommands();
      } catch (err) {
        console.error(`[WS] Reconnect failed: ${(err as Error).message}`);
        this.reconnecting = false;
        this.attemptReconnect();
      }
    }, backoff);
  }

  // ═══════════════════════════════════════════════════════════
  // S-05: Command replay after reconnect
  // ═══════════════════════════════════════════════════════════

  private replayQueuedCommands(): void {
    const toReplay: QueuedCommand[] = [];

    for (const [id, entry] of this.replayQueue) {
      if (this.acknowledgedIds.has(id)) {
        // Already acknowledged — skip
        this.replayQueue.delete(id);
      } else {
        toReplay.push(entry);
      }
    }

    if (toReplay.length === 0) {
      this.acknowledgedIds.clear();
      return;
    }

    console.error(`[WS] Replaying ${toReplay.length} queued command(s)`);

    for (const entry of toReplay) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error(`[WS] Connection lost during replay. Remaining commands stay queued.`);
        break;
      }

      const command: WSCommand = {
        type: 'command',
        id: entry.id,
        channel: this.channel,
        action: entry.action,
        params: entry.params,
      };

      // Set up pending command tracking with timeout
      const timer = setTimeout(() => {
        this.pendingCommands.delete(entry.id);
        this.replayQueue.delete(entry.id);
        entry.reject(new Error(`Replay timeout: ${entry.action}`));
      }, 30000);

      this.pendingCommands.set(entry.id, {
        resolve: entry.resolve,
        reject: entry.reject,
        timer,
      });

      this.ws.send(JSON.stringify(command));
    }

    this.acknowledgedIds.clear();
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pendingCommands.delete(id);
    }
    for (const [, queued] of this.replayQueue) {
      queued.reject(new Error(reason));
    }
    this.replayQueue.clear();
    this.reconnecting = false;
  }

  // ═══════════════════════════════════════════════════════════
  // S-06: Heartbeat mechanism
  // ═══════════════════════════════════════════════════════════

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();

        const pongTimer = setTimeout(() => {
          console.error('[WS] Heartbeat timeout — no pong received. Forcing reconnect.');
          this.ws?.terminate();
        }, FigmentoWSClient.HEARTBEAT_TIMEOUT_MS);

        this.ws.once('pong', () => clearTimeout(pongTimer));
      }
    }, FigmentoWSClient.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
