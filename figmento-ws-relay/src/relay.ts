import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { RelayMessage } from './types';

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

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        channels: this.channels.size,
        clients: this.clients.size,
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
      case 'response':
        this.forwardToChannel(sender, msg.channel, raw.toString());
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
      }
    }

    ws.send(JSON.stringify({ type: 'left', channel }));
  }

  private forwardToChannel(sender: WebSocket, channel: string, rawMessage: string): void {
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

    // Parse for logging
    try {
      const parsed = JSON.parse(rawMessage);
      const direction = parsed.type === 'command' ? 'CMD' : 'RSP';
      const detail = parsed.type === 'command' ? parsed.action : (parsed.success ? 'OK' : 'ERR');
      console.log(`[Figmento Relay] ${direction} ${parsed.id || '?'} [${channel}] ${detail} -> ${forwarded} peer(s)`);
    } catch {
      // ignore parse errors for logging
    }
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

    this.wss.close(() => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('[Figmento Relay] Server stopped, all connections closed');
        });
      }
    });
  }
}
