import WebSocket from 'ws';
import { WSCommand, WSResponse } from './types';

/**
 * WebSocket client that connects to the Figmento relay server.
 * Sends commands to the Figma plugin and receives responses.
 */
export class FigmentoWSClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private channel: string = '';
  private connected: boolean = false;
  private pendingCommands: Map<string, {
    resolve: (response: WSResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private commandCounter: number = 0;

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
        // Join the channel
        this.ws!.send(JSON.stringify({ type: 'join', channel }));
      });

      this.ws.on('message', (raw: Buffer) => {
        let msg: any;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        // Handle join confirmation
        if (msg.type === 'joined') {
          clearTimeout(timeout);
          this.connected = true;
          resolve();
          return;
        }

        // Handle command responses
        if (msg.type === 'response') {
          const pending = this.pendingCommands.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingCommands.delete(msg.id);
            pending.resolve(msg as WSResponse);
          }
          return;
        }

        // Handle errors
        if (msg.type === 'error') {
          console.error(`[WS] Relay error: ${msg.error}`);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        // Reject all pending commands
        for (const [id, pending] of this.pendingCommands) {
          clearTimeout(pending.timer);
          pending.reject(new Error('WebSocket connection closed'));
          this.pendingCommands.delete(id);
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
   * Disconnect from the relay server.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.channel = '';
  }

  /**
   * Send a command to the Figma plugin and wait for a response.
   */
  sendCommand(action: string, params: Record<string, unknown>, timeoutMs: number = 30000): Promise<WSResponse> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to Figma. Use connect_to_figma tool first.'));
        return;
      }

      const id = `cmd-${++this.commandCounter}-${Date.now()}`;

      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command timeout after ${timeoutMs}ms: ${action}`));
      }, timeoutMs);

      this.pendingCommands.set(id, { resolve, reject, timer });

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
}
