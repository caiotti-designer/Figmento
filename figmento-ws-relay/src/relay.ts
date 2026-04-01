import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { RelayMessage, CommandMessage, ResponseMessage } from './types';
import { handleChatRequest, getActiveChatRequests } from './chat/chat-endpoint';
import {
  handleClaudeCodeTurn,
  getActiveClaudeCodeTurns,
  ClaudeCodeTurnRequest,
} from './chat/claude-code-handler';
import { sessionManager } from './chat/claude-code-session-manager';

export interface RelayConfig {
  port: number;
  maxPayload: number;
  allowedOrigins: string[]; // ['*'] means allow all
  rateLimitMaxConnections: number;
}

interface ClientInfo {
  ws: WebSocket;
  channels: Set<string>;
  isAlive: boolean;
}

/** Relay command ID prefix — distinguishes relay-originated commands from MCP/plugin commands. */
export const RELAY_CMD_PREFIX = 'relay-';

/** Default timeout for relay-originated commands (ms). Increased to 120s to handle batch_execute and complex canvas ops. */
const RELAY_CMD_TIMEOUT = 120_000;

interface PendingRelayCommand {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function getClientIp(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return request.socket.remoteAddress || 'unknown';
}

/**
 * Channel-based WebSocket relay server.
 * Clients join channels, and messages are forwarded to all other clients in the same channel.
 */
export class FigmentoRelay {
  private wss: WebSocketServer | null = null;
  private httpServer: ReturnType<typeof createHttpServer> | null = null;
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private channels: Map<string, Set<WebSocket>> = new Map();
  private connectionsByIp: Map<string, number> = new Map();
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private config: RelayConfig | null = null;

  /** Pending relay-originated commands awaiting responses from channel clients. */
  private pendingRelayCommands: Map<string, PendingRelayCommand> = new Map();
  private relayCommandCounter = 0;

  start(config: RelayConfig): void {
    this.config = config;

    this.httpServer = createHttpServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Figmento Relay] Port ${config.port} is already in use.`);
        console.error(`[Figmento Relay] Kill the existing process or set a different port.`);
        process.exit(1);
      }
      console.error(`[Figmento Relay] HTTP server error:`, err.message);
    });

    this.wss = new WebSocketServer({
      server: this.httpServer,
      maxPayload: config.maxPayload,
      verifyClient: (info, callback) => {
        this.verifyClient(info, callback);
      },
    });

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const ip = getClientIp(request);
      const clientInfo: ClientInfo = { ws, channels: new Set(), isAlive: true };
      this.clients.set(ws, clientInfo);
      console.log(`[Figmento Relay] Client connected from ${ip} (${this.clients.size} total)`);

      ws.on('pong', () => {
        const client = this.clients.get(ws);
        if (client) client.isAlive = true;
      });

      ws.on('message', (raw: Buffer) => {
        this.handleMessage(ws, raw);
      });

      ws.on('close', () => {
        this.handleDisconnect(ws, ip);
      });

      ws.on('error', (err: Error) => {
        console.error(`[Figmento Relay] Client error:`, err.message);
      });
    });

    this.wss.on('error', (err: Error) => {
      console.error(`[Figmento Relay] WebSocket server error:`, err.message);
    });

    this.startKeepalive();

    this.httpServer.listen(config.port, () => {
      console.log(`[Figmento Relay] Server started on port ${config.port}`);
      console.log(`[Figmento Relay] Health check: http://localhost:${config.port}/health`);
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Chat turn endpoint (POST /chat/turn)
    const handled = await handleChatRequest(this, req, res);
    if (handled) return;

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        channels: this.channels.size,
        clients: this.clients.size,
        chatEngine: { activeRequests: getActiveChatRequests() },
        claudeCode: { activeTurns: getActiveClaudeCodeTurns() },
      }));
      return;
    }

    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'figmento-ws-relay', version: '1.0.0' }));
      return;
    }

    res.writeHead(404);
    res.end();
  }

  private verifyClient(
    info: { origin: string; req: IncomingMessage; secure: boolean },
    callback: (result: boolean, code?: number, message?: string) => void
  ): void {
    const config = this.config!;
    const ip = getClientIp(info.req);

    // Rate limiting
    const currentCount = this.connectionsByIp.get(ip) || 0;
    if (currentCount >= config.rateLimitMaxConnections) {
      console.warn(`[Figmento Relay] Rate limit exceeded for ${ip} (${currentCount}/${config.rateLimitMaxConnections})`);
      callback(false, 429, 'Too many connections');
      return;
    }

    // Origin validation
    const allowAll = config.allowedOrigins.length === 1 && config.allowedOrigins[0] === '*';
    if (!allowAll && info.origin) {
      if (!config.allowedOrigins.includes(info.origin)) {
        console.warn(`[Figmento Relay] Origin rejected: ${info.origin} from ${ip}`);
        callback(false, 403, 'Origin not allowed');
        return;
      }
    }

    // Track connection
    this.connectionsByIp.set(ip, currentCount + 1);
    callback(true);
  }

  private startKeepalive(): void {
    this.keepaliveInterval = setInterval(() => {
      for (const [ws, client] of this.clients) {
        if (!client.isAlive) {
          console.log(`[Figmento Relay] Terminating unresponsive client`);
          ws.terminate();
          continue;
        }
        client.isAlive = false;
        ws.ping();
      }
    }, 30_000);
  }

  private handleMessage(sender: WebSocket, raw: Buffer): void {
    let msg: RelayMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sender.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'join':
        this.joinChannel(sender, msg.channel);
        break;

      case 'leave':
        this.leaveChannel(sender, msg.channel);
        break;

      case 'command':
        this.forwardToChannel(sender, msg.channel, raw.toString(), msg);
        break;

      case 'response':
        // Intercept responses for relay-originated commands before forwarding
        if (msg.id.startsWith(RELAY_CMD_PREFIX)) {
          this.resolveRelayCommand(msg as ResponseMessage);
        } else {
          this.forwardToChannel(sender, msg.channel, raw.toString(), msg);
        }
        break;

      case 'claude-code-turn':
        this.handleClaudeCodeTurnMessage(sender, msg as unknown as ClaudeCodeTurnRequest);
        break;

      default:
        sender.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${(msg as any).type}` }));
    }
  }

  private joinChannel(ws: WebSocket, channel: string): void {
    const client = this.clients.get(ws);
    if (!client) return;

    client.channels.add(channel);

    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(ws);

    const channelSize = this.channels.get(channel)!.size;
    console.log(`[Figmento Relay] Client joined channel "${channel}" (${channelSize} in channel)`);

    ws.send(JSON.stringify({
      type: 'joined',
      channel,
      clients: channelSize,
    }));

    // Pre-warm chat engine on connect (fire-and-forget)
    this.preWarmChat();
  }

  /** Pre-warm system prompt, tool schemas, and knowledge cache on first connect. */
  private preWarmDone = false;
  private preWarmChat(): void {
    if (this.preWarmDone) return;
    this.preWarmDone = true;

    try {
      // Pre-build system prompt (static parts only — knowledge is lazy-loaded on first brief)
      const { buildSystemPrompt } = require('./chat/system-prompt');
      buildSystemPrompt();

      // Pre-load compiled knowledge into memory so first design request doesn't pay import cost
      require('./knowledge/compiled-knowledge');

      // Pre-resolve tool definitions
      const { chatToolResolver } = require('./chat/chat-tools');
      chatToolResolver();

      console.log('[Figmento Relay] Chat engine pre-warmed (system prompt + knowledge + tools cached)');
    } catch (err) {
      console.error('[Figmento Relay] Pre-warm failed (non-critical):', (err as Error).message);
    }
  }

  private leaveChannel(ws: WebSocket, channel: string): void {
    const client = this.clients.get(ws);
    if (!client) return;

    client.channels.delete(channel);

    const channelClients = this.channels.get(channel);
    if (channelClients) {
      channelClients.delete(ws);
      if (channelClients.size === 0) {
        this.channels.delete(channel);
        console.log(`[Figmento Relay] Channel "${channel}" removed (empty)`);
        // CR-5.1: destroy Claude Code session when channel is empty
        sessionManager.destroy(channel);
      }
    }

    ws.send(JSON.stringify({ type: 'left', channel }));
  }

  private forwardToChannel(sender: WebSocket, channel: string, rawMessage: string, parsed: CommandMessage | ResponseMessage): void {
    const channelClients = this.channels.get(channel);
    if (!channelClients) {
      sender.send(JSON.stringify({
        type: 'error',
        error: `Channel "${channel}" does not exist. Join it first.`,
      }));
      return;
    }

    let forwarded = 0;
    for (const client of channelClients) {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(rawMessage);
        forwarded++;
      }
    }

    // Log using pre-parsed message (already parsed in handleMessage)
    const direction = parsed.type === 'command' ? 'CMD' : 'RSP';
    const detail = parsed.type === 'command' ? parsed.action : (parsed.success ? 'OK' : 'ERR');
    console.log(`[Figmento Relay] ${direction} ${parsed.id || '?'} [${channel}] ${detail} -> ${forwarded} peer(s)`);
  }

  private handleDisconnect(ws: WebSocket, ip?: string): void {
    const client = this.clients.get(ws);
    if (client) {
      for (const channel of client.channels) {
        const channelClients = this.channels.get(channel);
        if (channelClients) {
          channelClients.delete(ws);
          if (channelClients.size === 0) {
            this.channels.delete(channel);
            // CR-5.1: destroy Claude Code session when channel is empty
            sessionManager.destroy(channel);
          }
        }
      }
    }
    this.clients.delete(ws);

    // Decrement rate limit counter
    if (ip) {
      const count = this.connectionsByIp.get(ip) || 0;
      if (count <= 1) {
        this.connectionsByIp.delete(ip);
      } else {
        this.connectionsByIp.set(ip, count - 1);
      }
    }

    console.log(`[Figmento Relay] Client disconnected (${this.clients.size} remaining)`);
  }

  // ═══════════════════════════════════════════════════════════════
  // CLAUDE CODE TURN — CR-5
  // ═══════════════════════════════════════════════════════════════

  private async handleClaudeCodeTurnMessage(sender: WebSocket, msg: ClaudeCodeTurnRequest): Promise<void> {
    const channelClients = this.channels.get(msg.channel);
    console.log(`[Figmento Relay] claude-code-turn on channel="${msg.channel}" (${channelClients?.size ?? 0} clients on channel)`);

    // Stream progress events to the sender while the turn is in progress
    const onProgress = (event: { type: string; toolName?: string; toolIndex?: number }) => {
      if (sender.readyState === WebSocket.OPEN) {
        sender.send(JSON.stringify({
          type: 'claude-code-progress',
          channel: msg.channel,
          progressType: event.type,
          toolName: event.toolName,
          toolIndex: event.toolIndex,
        }));
      }
    };

    const result = await handleClaudeCodeTurn(msg, onProgress);

    // Send result back to the requesting client
    if (sender.readyState === WebSocket.OPEN) {
      sender.send(JSON.stringify(result));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RELAY-AS-PARTICIPANT — send commands and receive responses on a channel
  // ═══════════════════════════════════════════════════════════════

  /**
   * Send a command to ALL clients in a channel (relay is the sender, no exclusion).
   * Returns a promise that resolves when the matching response arrives.
   * Uses `relay-` prefix on command IDs so the relay can intercept its own responses.
   */
  sendCommandToChannel(
    channel: string,
    action: string,
    params: Record<string, unknown>,
    timeoutMs: number = RELAY_CMD_TIMEOUT,
  ): Promise<Record<string, unknown>> {
    const channelClients = this.channels.get(channel);
    if (!channelClients || channelClients.size === 0) {
      return Promise.reject(new Error(`No clients in channel "${channel}"`));
    }

    const cmdId = `${RELAY_CMD_PREFIX}${++this.relayCommandCounter}-${Date.now()}`;

    const commandMsg = JSON.stringify({
      type: 'command',
      id: cmdId,
      channel,
      action,
      params,
    });

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRelayCommands.delete(cmdId);
        reject(new Error(`Relay command timeout: ${action} (${cmdId})`));
      }, timeoutMs);

      this.pendingRelayCommands.set(cmdId, {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject: (err) => { clearTimeout(timer); reject(err); },
        timer,
      });

      // Send to ALL clients in the channel (relay is not a WS client, no sender exclusion)
      let sent = 0;
      for (const client of channelClients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(commandMsg);
          sent++;
        }
      }

      console.log(`[Figmento Relay] RELAY-CMD ${cmdId} [${channel}] ${action} -> ${sent} client(s)`);

      if (sent === 0) {
        clearTimeout(timer);
        this.pendingRelayCommands.delete(cmdId);
        reject(new Error(`No connected clients in channel "${channel}" to receive command`));
      }
    });
  }

  /**
   * Resolve a pending relay command when its response arrives from a channel client.
   */
  private resolveRelayCommand(msg: ResponseMessage): void {
    const pending = this.pendingRelayCommands.get(msg.id);
    if (!pending) {
      console.warn(`[Figmento Relay] Received response for unknown relay command: ${msg.id}`);
      return;
    }

    this.pendingRelayCommands.delete(msg.id);
    console.log(`[Figmento Relay] RELAY-RSP ${msg.id} [${msg.channel}] ${msg.success ? 'OK' : 'ERR'}`);

    if (msg.success) {
      pending.resolve(msg.data || {});
    } else {
      pending.reject(new Error(msg.error || 'Command failed'));
    }
  }

  /** Get the HTTP server instance (for external route registration). */
  getHttpServer(): ReturnType<typeof createHttpServer> | null {
    return this.httpServer;
  }

  /** Check if a channel has connected clients. */
  hasClientsInChannel(channel: string): boolean {
    const clients = this.channels.get(channel);
    return !!clients && clients.size > 0;
  }

  stop(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    if (!this.wss) return;

    // Close all client connections with a "going away" code
    for (const [ws] of this.clients) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        // Ignore errors on already-closed sockets
      }
    }
    this.clients.clear();
    this.channels.clear();
    this.connectionsByIp.clear();

    // Reject all pending relay commands
    for (const [id, pending] of this.pendingRelayCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Server shutting down'));
    }
    this.pendingRelayCommands.clear();

    this.wss.close(() => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('[Figmento Relay] Server stopped, all connections closed');
        });
      }
    });
  }
}
