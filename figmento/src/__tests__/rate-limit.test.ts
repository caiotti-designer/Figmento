// Mock the utils module to avoid DOM dependencies
jest.mock('../ui/utils', () => ({
  showToast: jest.fn(),
}));

// Mock the state module
jest.mock('../ui/state', () => ({
  dom: {},
}));

import { updateRateLimits, getRateLimitInfo, resetRateLimits } from '../ui/rate-limit';
import { showToast } from '../ui/utils';

const mockedShowToast = showToast as jest.MockedFunction<typeof showToast>;

function makeHeaders(headerMap: Record<string, string>): Headers {
  const h = new Headers();
  for (const [key, value] of Object.entries(headerMap)) {
    h.set(key, value);
  }
  return h;
}

beforeEach(() => {
  resetRateLimits();
  jest.clearAllMocks();
});

describe('Claude header parsing', () => {
  test('parses anthropic rate limit headers correctly', () => {
    const headers = makeHeaders({
      'anthropic-ratelimit-requests-limit': '1000',
      'anthropic-ratelimit-requests-remaining': '950',
      'anthropic-ratelimit-tokens-limit': '100000',
      'anthropic-ratelimit-tokens-remaining': '99000',
    });

    updateRateLimits('claude', headers);
    const info = getRateLimitInfo('claude');

    expect(info.requestsLimit).toBe(1000);
    expect(info.requestsRemaining).toBe(950);
    expect(info.tokensLimit).toBe(100000);
    expect(info.tokensRemaining).toBe(99000);
  });
});

describe('OpenAI header parsing', () => {
  test('parses openai rate limit headers correctly', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '500',
      'x-ratelimit-remaining-requests': '499',
      'x-ratelimit-limit-tokens': '50000',
      'x-ratelimit-remaining-tokens': '49000',
    });

    updateRateLimits('openai', headers);
    const info = getRateLimitInfo('openai');

    expect(info.requestsLimit).toBe(500);
    expect(info.requestsRemaining).toBe(499);
    expect(info.tokensLimit).toBe(50000);
    expect(info.tokensRemaining).toBe(49000);
  });
});

describe('Gemini header parsing', () => {
  test('parses gemini rate limit headers and leaves tokens as null', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit': '200',
      'x-ratelimit-remaining': '180',
    });

    updateRateLimits('gemini', headers);
    const info = getRateLimitInfo('gemini');

    expect(info.requestsLimit).toBe(200);
    expect(info.requestsRemaining).toBe(180);
    expect(info.tokensLimit).toBeNull();
    expect(info.tokensRemaining).toBeNull();
    expect(info.tokensReset).toBeNull();
  });
});

describe('Rate limit warnings', () => {
  test('warns when rate limit reached (0 remaining)', () => {
    const headers = makeHeaders({
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-requests-remaining': '0',
    });

    updateRateLimits('claude', headers);

    expect(mockedShowToast).toHaveBeenCalledTimes(1);
    expect(mockedShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Rate limit reached'),
      'warning',
      expect.any(Number)
    );
  });

  test('warns when approaching limit (<=10% remaining)', () => {
    const headers = makeHeaders({
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-requests-remaining': '5',
    });

    updateRateLimits('claude', headers);

    expect(mockedShowToast).toHaveBeenCalledTimes(1);
    expect(mockedShowToast).toHaveBeenCalledWith(
      expect.stringContaining('remaining'),
      'warning',
      expect.any(Number)
    );
  });

  test('does not warn when well within limits', () => {
    const headers = makeHeaders({
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-requests-remaining': '90',
    });

    updateRateLimits('claude', headers);

    expect(mockedShowToast).not.toHaveBeenCalled();
  });
});

describe('resetRateLimits', () => {
  test('resets a specific provider while leaving others unchanged', () => {
    const claudeHeaders = makeHeaders({
      'anthropic-ratelimit-requests-limit': '1000',
      'anthropic-ratelimit-requests-remaining': '900',
      'anthropic-ratelimit-tokens-limit': '100000',
      'anthropic-ratelimit-tokens-remaining': '90000',
    });
    const openaiHeaders = makeHeaders({
      'x-ratelimit-limit-requests': '500',
      'x-ratelimit-remaining-requests': '400',
      'x-ratelimit-limit-tokens': '50000',
      'x-ratelimit-remaining-tokens': '40000',
    });

    updateRateLimits('claude', claudeHeaders);
    updateRateLimits('openai', openaiHeaders);

    resetRateLimits('claude');

    const claudeInfo = getRateLimitInfo('claude');
    expect(claudeInfo.requestsLimit).toBeNull();
    expect(claudeInfo.requestsRemaining).toBeNull();
    expect(claudeInfo.tokensLimit).toBeNull();
    expect(claudeInfo.tokensRemaining).toBeNull();
    expect(claudeInfo.requestsReset).toBeNull();
    expect(claudeInfo.tokensReset).toBeNull();
    expect(claudeInfo.lastUpdated).toBe(0);

    const openaiInfo = getRateLimitInfo('openai');
    expect(openaiInfo.requestsLimit).toBe(500);
    expect(openaiInfo.requestsRemaining).toBe(400);
  });

  test('resets all providers when called without arguments', () => {
    const claudeHeaders = makeHeaders({
      'anthropic-ratelimit-requests-limit': '1000',
      'anthropic-ratelimit-requests-remaining': '900',
    });
    const openaiHeaders = makeHeaders({
      'x-ratelimit-limit-requests': '500',
      'x-ratelimit-remaining-requests': '400',
    });
    const geminiHeaders = makeHeaders({
      'x-ratelimit-limit': '200',
      'x-ratelimit-remaining': '180',
    });

    updateRateLimits('claude', claudeHeaders);
    updateRateLimits('openai', openaiHeaders);
    updateRateLimits('gemini', geminiHeaders);

    resetRateLimits();

    for (const provider of ['claude', 'openai', 'gemini'] as const) {
      const info = getRateLimitInfo(provider);
      expect(info.requestsLimit).toBeNull();
      expect(info.requestsRemaining).toBeNull();
      expect(info.tokensLimit).toBeNull();
      expect(info.tokensRemaining).toBeNull();
      expect(info.requestsReset).toBeNull();
      expect(info.tokensReset).toBeNull();
      expect(info.lastUpdated).toBe(0);
    }
  });
});

describe('Edge cases', () => {
  test('non-numeric header values are parsed as null', () => {
    const headers = makeHeaders({
      'anthropic-ratelimit-requests-limit': 'abc',
      'anthropic-ratelimit-requests-remaining': 'xyz',
      'anthropic-ratelimit-tokens-limit': 'not-a-number',
      'anthropic-ratelimit-tokens-remaining': '',
    });

    updateRateLimits('claude', headers);
    const info = getRateLimitInfo('claude');

    expect(info.requestsLimit).toBeNull();
    expect(info.requestsRemaining).toBeNull();
    expect(info.tokensLimit).toBeNull();
    expect(info.tokensRemaining).toBeNull();
  });

  test('empty headers result in all null fields and no warnings', () => {
    const headers = makeHeaders({});

    updateRateLimits('claude', headers);
    const info = getRateLimitInfo('claude');

    expect(info.requestsLimit).toBeNull();
    expect(info.requestsRemaining).toBeNull();
    expect(info.tokensLimit).toBeNull();
    expect(info.tokensRemaining).toBeNull();
    expect(info.requestsReset).toBeNull();
    expect(info.tokensReset).toBeNull();
    expect(mockedShowToast).not.toHaveBeenCalled();
  });

  test('lastUpdated is set after updateRateLimits', () => {
    const headers = makeHeaders({
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-requests-remaining': '90',
    });

    const before = Date.now();
    updateRateLimits('claude', headers);
    const info = getRateLimitInfo('claude');

    expect(info.lastUpdated).toBeGreaterThan(0);
    expect(info.lastUpdated).toBeGreaterThanOrEqual(before);
    expect(info.lastUpdated).toBeLessThanOrEqual(Date.now());
  });
});
