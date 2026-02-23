import { WebSocketServer, WebSocket } from 'ws';
import { RelayMessage } from './types';

interface ClientInfo {
  ws: WebSocket;
  channels: Set<string>;
}

/**
 * Channel-based WebSocket relay server.
 * Clients join channels, and messages are forwarded to all other clients in the same channel.
 */
export class FigmentoRelay {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private channels: Map<string, Set<WebSocket>> = new Map();

  start(port: number): void {
    this.wss = new WebSocketServer({ port });

    console.log(`[Figmento Relay] WebSocket server started on ws://localhost:${port}`);

    this.wss.on('connection', (ws: WebSocket) => {
      const clientInfo: ClientInfo = { ws, channels: new Set() };
      this.clients.set(ws, clientInfo);
      console.log(`[Figmento Relay] Client connected (${this.clients.size} total)`);

      ws.on('message', (raw: Buffer) => {
        this.handleMessage(ws, raw);
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (err: Error) => {
        console.error(`[Figmento Relay] Client error:`, err.message);
      });
    });

    this.wss.on('error', (err: Error) => {
      console.error(`[Figmento Relay] Server error:`, err.message);
    });
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

  private handleDisconnect(ws: WebSocket): void {
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
    console.log(`[Figmento Relay] Client disconnected (${this.clients.size} remaining)`);
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      console.log('[Figmento Relay] Server stopped');
    }
  }
}
