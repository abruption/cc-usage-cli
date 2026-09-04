import type { RateLimitInfo } from './types.js';
import { readCredentials } from './credentials.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

// Cheapest possible probe: alias (no date suffix — immune to model deprecation)
const PROBE_BODY = JSON.stringify({
  model: 'claude-haiku-4-5',
  max_tokens: 1,
  messages: [{ role: 'user', content: 'hi' }],
});

/**
 * Make a minimal API call and extract rate-limit headers.
 *
 * `anthropic-beta: oauth-2025-04-20` is required — without it the
 * rate-limit headers are not included (verified empirically).
 */
export async function probeRateLimits(): Promise<{
  rateLimits: RateLimitInfo;
  rawHeaders: Record<string, string>;
}> {
  const creds = readCredentials();
  const oauth = creds.claudeAiOauth;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${oauth.accessToken}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20',
    },
    body: PROBE_BODY,
  });

  const rawHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    if (key.startsWith('anthropic-ratelimit-')) {
      rawHeaders[key] = value;
    }
  });

  await res.text();

  if (!rawHeaders['anthropic-ratelimit-unified-status']) {
    if (res.status === 401) {
      throw new Error(
        `Authentication failed (HTTP 401).\n` +
        `Your access token may have expired — run Claude Code to auto-refresh.`
      );
    }
    throw new Error(
      `No rate-limit headers in response (HTTP ${res.status}).\n` +
      `Ensure you have an active Claude Code subscription.`
    );
  }

  const h = (name: string) => rawHeaders[`anthropic-ratelimit-unified-${name}`] ?? '';

  const rateLimits: RateLimitInfo = {
    status: h('status'),
    fiveHour: {
      status: h('5h-status'),
      utilization: parseFloat(h('5h-utilization')) || 0,
      reset: parseInt(h('5h-reset'), 10) || 0,
    },
    sevenDay: {
      status: h('7d-status'),
      utilization: parseFloat(h('7d-utilization')) || 0,
      reset: parseInt(h('7d-reset'), 10) || 0,
    },
    representativeClaim: h('representative-claim'),
    fallback: h('fallback'),
    fallbackPercentage: parseFloat(h('fallback-percentage')) || 0,
    overageStatus: h('overage-status'),
    overageDisabledReason: h('overage-disabled-reason'),
    reset: parseInt(h('reset'), 10) || 0,
    subscriptionType: oauth.subscriptionType,
    rateLimitTier: oauth.rateLimitTier,
    source: 'api',
  };

  return { rateLimits, rawHeaders };
}
