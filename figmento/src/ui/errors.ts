// Structured error types for better error handling

export class PluginError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

export class TokenLimitError extends PluginError {
  constructor(message = 'Response exceeded token limits. Try a smaller or simpler image region.') {
    super(message, 'TOKEN_LIMIT');
    this.name = 'TokenLimitError';
  }
}

export class RateLimitError extends PluginError {
  constructor(message = 'API rate limit reached. Please wait a moment and try again.') {
    super(message, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends PluginError {
  constructor(message = 'The AI took too long to respond. Try cropping to a smaller area or simpler section.') {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class ParseError extends PluginError {
  constructor(
    message = 'The AI response was incomplete. The image may be too complex — try cropping individual sections.'
  ) {
    super(message, 'PARSE_ERROR');
    this.name = 'ParseError';
  }
}

export class ApiKeyError extends PluginError {
  constructor(message = 'Please configure your API key first') {
    super(message, 'API_KEY');
    this.name = 'ApiKeyError';
  }
}

export class CancelledError extends PluginError {
  constructor(message = 'Cancelled') {
    super(message, 'CANCELLED');
    this.name = 'CancelledError';
  }
}

export function classifyError(error: unknown): PluginError {
  if (error instanceof PluginError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';

  if (name === 'AbortError') return new CancelledError('Request cancelled');
  if (/token|length/i.test(message)) return new TokenLimitError(message);
  if (/429|rate/i.test(message)) return new RateLimitError(message);
  if (/timed?\s*out/i.test(message)) return new TimeoutError(message);
  if (/parse|json/i.test(message)) return new ParseError(message);

  return new PluginError(message || 'An unknown error occurred', 'UNKNOWN');
}
