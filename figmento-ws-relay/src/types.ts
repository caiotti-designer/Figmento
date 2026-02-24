/**
 * WebSocket relay protocol message types.
 */

export interface JoinMessage {
  type: 'join';
  channel: string;
}

export interface LeaveMessage {
  type: 'leave';
  channel: string;
}

export interface CommandMessage {
  type: 'command';
  id: string;
  channel: string;
  action: string;
  params: Record<string, unknown>;
}

export interface ResponseMessage {
  type: 'response';
  id: string;
  channel: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  recoverable?: boolean;
}

export type RelayMessage = JoinMessage | LeaveMessage | CommandMessage | ResponseMessage;
