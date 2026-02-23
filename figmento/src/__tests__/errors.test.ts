import {
  PluginError,
  TokenLimitError,
  RateLimitError,
  TimeoutError,
  ParseError,
  ApiKeyError,
  CancelledError,
  classifyError,
} from '../ui/errors';

describe('Error Classes', () => {
  test('PluginError has correct name and code', () => {
    const err = new PluginError('test message', 'TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('PluginError');
    expect(err instanceof Error).toBe(true);
  });

  test('TokenLimitError uses default message', () => {
    const err = new TokenLimitError();
    expect(err.code).toBe('TOKEN_LIMIT');
    expect(err.name).toBe('TokenLimitError');
    expect(err.message).toContain('token');
  });

  test('RateLimitError uses default message', () => {
    const err = new RateLimitError();
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.name).toBe('RateLimitError');
    expect(err.message).toContain('rate limit');
  });

  test('TimeoutError uses default message', () => {
    const err = new TimeoutError();
    expect(err.code).toBe('TIMEOUT');
    expect(err.name).toBe('TimeoutError');
  });

  test('ParseError uses default message', () => {
    const err = new ParseError();
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.name).toBe('ParseError');
  });

  test('ApiKeyError uses default message', () => {
    const err = new ApiKeyError();
    expect(err.code).toBe('API_KEY');
    expect(err.name).toBe('ApiKeyError');
  });

  test('CancelledError uses default message', () => {
    const err = new CancelledError();
    expect(err.code).toBe('CANCELLED');
    expect(err.name).toBe('CancelledError');
    expect(err.message).toBe('Cancelled');
  });

  test('Custom messages override defaults', () => {
    const err = new TokenLimitError('custom token error');
    expect(err.message).toBe('custom token error');
    expect(err.code).toBe('TOKEN_LIMIT');
  });

  test('All error types extend PluginError', () => {
    expect(new TokenLimitError() instanceof PluginError).toBe(true);
    expect(new RateLimitError() instanceof PluginError).toBe(true);
    expect(new TimeoutError() instanceof PluginError).toBe(true);
    expect(new ParseError() instanceof PluginError).toBe(true);
    expect(new ApiKeyError() instanceof PluginError).toBe(true);
    expect(new CancelledError() instanceof PluginError).toBe(true);
  });
});

describe('classifyError', () => {
  test('returns PluginError instances unchanged', () => {
    const original = new TokenLimitError('original');
    const result = classifyError(original);
    expect(result).toBe(original);
  });

  test('classifies AbortError as CancelledError', () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const result = classifyError(abortError);
    expect(result).toBeInstanceOf(CancelledError);
    expect(result.code).toBe('CANCELLED');
  });

  test('classifies token-related errors as TokenLimitError', () => {
    const err = new Error('Maximum token length exceeded');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TokenLimitError);
    expect(result.code).toBe('TOKEN_LIMIT');
  });

  test('classifies length-related errors as TokenLimitError', () => {
    const err = new Error('Content length too long');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TokenLimitError);
    expect(result.code).toBe('TOKEN_LIMIT');
  });

  test('classifies 429 errors as RateLimitError', () => {
    const err = new Error('HTTP 429 Too Many Requests');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(RateLimitError);
    expect(result.code).toBe('RATE_LIMIT');
  });

  test('classifies rate-related errors as RateLimitError', () => {
    const err = new Error('Rate limit exceeded');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(RateLimitError);
    expect(result.code).toBe('RATE_LIMIT');
  });

  test('classifies timeout errors as TimeoutError', () => {
    const err = new Error('Request timed out');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TimeoutError);
    expect(result.code).toBe('TIMEOUT');
  });

  test('classifies "time out" (with space) as TimeoutError', () => {
    const err = new Error('Connection time out');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TimeoutError);
    expect(result.code).toBe('TIMEOUT');
  });

  test('classifies parse errors as ParseError', () => {
    const err = new Error('Failed to parse JSON response');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(ParseError);
    expect(result.code).toBe('PARSE_ERROR');
  });

  test('classifies JSON errors as ParseError', () => {
    const err = new Error('Invalid JSON format');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(ParseError);
    expect(result.code).toBe('PARSE_ERROR');
  });

  test('token keyword takes priority over json keyword in classification', () => {
    // "Unexpected token in JSON" contains both "token" and "json"
    // The token check runs first, so it classifies as TokenLimitError
    const err = new Error('Unexpected token in JSON');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TokenLimitError);
  });

  test('classifies unknown errors as PluginError with UNKNOWN code', () => {
    const err = new Error('Something completely unexpected');
    const result = classifyError(err);
    expect(result).toBeInstanceOf(PluginError);
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('Something completely unexpected');
  });

  test('handles string errors', () => {
    const result = classifyError('string error message');
    expect(result).toBeInstanceOf(PluginError);
    expect(result.message).toBe('string error message');
  });

  test('handles null/undefined errors', () => {
    const result = classifyError(null);
    expect(result).toBeInstanceOf(PluginError);

    const result2 = classifyError(undefined);
    expect(result2).toBeInstanceOf(PluginError);
  });

  test('handles number errors', () => {
    const result = classifyError(42);
    expect(result).toBeInstanceOf(PluginError);
    expect(result.message).toBe('42');
  });

  test('preserves original message in classified errors', () => {
    const err = new Error('API rate limit reached, please retry');
    const result = classifyError(err);
    expect(result.message).toBe('API rate limit reached, please retry');
  });
});
