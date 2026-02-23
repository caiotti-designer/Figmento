// Rate limit tracking from AI provider response headers
// Parses provider-specific headers and warns users when approaching limits

import type { AIProvider } from '../types';
import { showToast } from './utils';

interface RateLimitInfo {
  requestsLimit: number | null;
  requestsRemaining: number | null;
  requestsReset: string | null;
  tokensLimit: number | null;
  tokensRemaining: number | null;
  tokensReset: string | null;
  lastUpdated: number;
}

const rateLimits: Record<AIProvider, RateLimitInfo> = {
  claude: createEmptyInfo(),
  openai: createEmptyInfo(),
  gemini: createEmptyInfo(),
};

function createEmptyInfo(): RateLimitInfo {
  return {
    requestsLimit: null,
    requestsRemaining: null,
    requestsReset: null,
    tokensLimit: null,
    tokensRemaining: null,
    tokensReset: null,
    lastUpdated: 0,
  };
}

/**
 * Extract rate limit info from a Claude (Anthropic) API response.
 * Headers: anthropic-ratelimit-requests-limit, anthropic-ratelimit-requests-remaining, etc.
 */
function parseClaudeHeaders(headers: Headers): Partial<RateLimitInfo> {
  return {
    requestsLimit: parseIntHeader(headers, 'anthropic-ratelimit-requests-limit'),
    requestsRemaining: parseIntHeader(headers, 'anthropic-ratelimit-requests-remaining'),
    requestsReset: headers.get('anthropic-ratelimit-requests-reset'),
    tokensLimit: parseIntHeader(headers, 'anthropic-ratelimit-tokens-limit'),
    tokensRemaining: parseIntHeader(headers, 'anthropic-ratelimit-tokens-remaining'),
    tokensReset: headers.get('anthropic-ratelimit-tokens-reset'),
  };
}

/**
 * Extract rate limit info from an OpenAI API response.
 * Headers: x-ratelimit-limit-requests, x-ratelimit-remaining-requests, etc.
 */
function parseOpenAIHeaders(headers: Headers): Partial<RateLimitInfo> {
  return {
    requestsLimit: parseIntHeader(headers, 'x-ratelimit-limit-requests'),
    requestsRemaining: parseIntHeader(headers, 'x-ratelimit-remaining-requests'),
    requestsReset: headers.get('x-ratelimit-reset-requests'),
    tokensLimit: parseIntHeader(headers, 'x-ratelimit-limit-tokens'),
    tokensRemaining: parseIntHeader(headers, 'x-ratelimit-remaining-tokens'),
    tokensReset: headers.get('x-ratelimit-reset-tokens'),
  };
}

/**
 * Extract rate limit info from a Gemini (Google) API response.
 * Google uses standard x-ratelimit headers on some endpoints.
 */
function parseGeminiHeaders(headers: Headers): Partial<RateLimitInfo> {
  return {
    requestsLimit: parseIntHeader(headers, 'x-ratelimit-limit'),
    requestsRemaining: parseIntHeader(headers, 'x-ratelimit-remaining'),
    requestsReset: headers.get('x-ratelimit-reset'),
    tokensLimit: null,
    tokensRemaining: null,
    tokensReset: null,
  };
}

function parseIntHeader(headers: Headers, name: string): number | null {
  const val = headers.get(name);
  if (val === null) return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

/**
 * Update rate limit tracking from an API response.
 * Call this after every successful (or 429) API response.
 */
export function updateRateLimits(provider: AIProvider, headers: Headers): void {
  let parsed: Partial<RateLimitInfo>;

  if (provider === 'claude') {
    parsed = parseClaudeHeaders(headers);
  } else if (provider === 'openai') {
    parsed = parseOpenAIHeaders(headers);
  } else {
    parsed = parseGeminiHeaders(headers);
  }

  const current = rateLimits[provider];
  Object.assign(current, parsed);
  current.lastUpdated = Date.now();

  checkAndWarn(provider);
}

/**
 * Warn the user if they're approaching rate limits.
 */
function checkAndWarn(provider: AIProvider): void {
  const info = rateLimits[provider];
  const { requestsRemaining, requestsLimit } = info;

  if (requestsRemaining !== null && requestsLimit !== null && requestsLimit > 0) {
    const ratio = requestsRemaining / requestsLimit;
    if (requestsRemaining === 0) {
      const resetMsg = info.requestsReset ? ' Resets at ' + info.requestsReset + '.' : '';
      showToast('Rate limit reached for ' + provider + '.' + resetMsg + ' Switch providers or wait.', 'warning', 8000);
    } else if (ratio <= 0.1) {
      showToast(
        provider + ': ' + requestsRemaining + '/' + requestsLimit + ' requests remaining.',
        'warning',
        5000
      );
    }
  }
}

/**
 * Get the current rate limit info for a provider.
 */
export function getRateLimitInfo(provider: AIProvider): Readonly<RateLimitInfo> {
  return rateLimits[provider];
}

/**
 * Reset all rate limit tracking (e.g. when switching API keys).
 */
export function resetRateLimits(provider?: AIProvider): void {
  if (provider) {
    rateLimits[provider] = createEmptyInfo();
  } else {
    rateLimits.claude = createEmptyInfo();
    rateLimits.openai = createEmptyInfo();
    rateLimits.gemini = createEmptyInfo();
  }
}
