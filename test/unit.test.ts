import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard, renderRaw } from '../src/render.js';
import type { RateLimitInfo } from '../src/types.js';

const MOCK_HEADERS: Record<string, string> = {
  'anthropic-ratelimit-unified-status': 'allowed',
  'anthropic-ratelimit-unified-5h-status': 'allowed',
  'anthropic-ratelimit-unified-5h-reset': '1788511800',
  'anthropic-ratelimit-unified-5h-utilization': '0.67',
  'anthropic-ratelimit-unified-7d-status': 'allowed',
  'anthropic-ratelimit-unified-7d-reset': '1788541200',
  'anthropic-ratelimit-unified-7d-utilization': '0.51',
  'anthropic-ratelimit-unified-representative-claim': 'five_hour',
  'anthropic-ratelimit-unified-fallback-percentage': '0.5',
  'anthropic-ratelimit-unified-fallback': 'available',
  'anthropic-ratelimit-unified-reset': '1788511800',
  'anthropic-ratelimit-unified-overage-disabled-reason': 'org_level_disabled',
  'anthropic-ratelimit-unified-overage-status': 'rejected',
};

function makeMockInfo(overrides: Partial<RateLimitInfo> = {}): RateLimitInfo {
  return {
    status: 'allowed',
    fiveHour: { status: 'allowed', utilization: 0.67, reset: Math.floor(Date.now() / 1000) + 7980 },
    sevenDay: { status: 'allowed', utilization: 0.51, reset: Math.floor(Date.now() / 1000) + 266400 },
    representativeClaim: 'five_hour',
    fallback: 'available',
    fallbackPercentage: 0.5,
    overageStatus: 'rejected',
    overageDisabledReason: 'org_level_disabled',
    reset: Math.floor(Date.now() / 1000) + 7980,
    subscriptionType: 'max',
    rateLimitTier: 'default_claude_max_20x',
    ...overrides,
  };
}

describe('renderDashboard', () => {
  it('should include 5-Hour and 7-Day labels', () => {
    const out = renderDashboard(makeMockInfo());
    assert.ok(out.includes('5-Hour'));
    assert.ok(out.includes('7-Day'));
  });

  it('should show utilization percentages', () => {
    const out = renderDashboard(makeMockInfo());
    assert.ok(out.includes('67%'));
    assert.ok(out.includes('51%'));
  });

  it('should display status', () => {
    const out = renderDashboard(makeMockInfo());
    assert.ok(out.includes('allowed'));
  });

  it('should clean tier name', () => {
    const out = renderDashboard(makeMockInfo());
    assert.ok(out.includes('claude_max_20x'));
    assert.ok(!out.includes('default_claude_max_20x'));
  });

  it('should show reset countdown', () => {
    const out = renderDashboard(makeMockInfo());
    assert.ok(out.includes('resets:'));
  });

  it('should show fallback info', () => {
    const out = renderDashboard(makeMockInfo());
    assert.ok(out.includes('Fallback'));
    assert.ok(out.includes('50%'));
  });

  it('should show cache age when cachedAt set', () => {
    const info = makeMockInfo({ cachedAt: Date.now() - 12000 });
    const out = renderDashboard(info);
    assert.ok(out.includes('Cached'));
  });

  it('should not show cache note for fresh data', () => {
    const out = renderDashboard(makeMockInfo());
    assert.ok(!out.includes('Cached'));
  });

  it('should handle 0% utilization', () => {
    const info = makeMockInfo({
      fiveHour: { status: 'allowed', utilization: 0, reset: 0 },
      sevenDay: { status: 'allowed', utilization: 0, reset: 0 },
    });
    const out = renderDashboard(info);
    assert.ok(out.includes('  0%'));
  });

  it('should handle 100% utilization', () => {
    const info = makeMockInfo({
      fiveHour: { status: 'limited', utilization: 1.0, reset: Math.floor(Date.now() / 1000) + 60 },
    });
    const out = renderDashboard(info);
    assert.ok(out.includes('100%'));
  });
});

describe('renderDashboard source indicator', () => {
  it('should show API probe note for api source', () => {
    const info = makeMockInfo({ source: 'api' });
    const out = renderDashboard(info);
    assert.ok(out.includes('Haiku probe'));
    const footer = out.split('\n').pop()!;
    assert.ok(footer.includes('free'), 'footer should show free');
    assert.ok(!footer.includes('⚠️ Fallback'), 'footer should not show fallback warning');
  });

  it('should show Fallback note for statusline-fallback source', () => {
    const info = makeMockInfo({ source: 'statusline-fallback' });
    const out = renderDashboard(info);
    const footer = out.split('\n').pop()!;
    assert.ok(footer.includes('Fallback'), 'footer should show Fallback');
    assert.ok(footer.includes('free'), 'footer should show free');
  });
});

describe('renderRaw', () => {
  it('should output all headers sorted alphabetically', () => {
    const out = renderRaw(MOCK_HEADERS);
    const lines = out.split('\n');
    assert.equal(lines.length, Object.keys(MOCK_HEADERS).length);
    const keys = lines.map(l => l.split(':')[0]!);
    const sorted = [...keys].sort();
    assert.deepEqual(keys, sorted);
  });

  it('should include key: value format', () => {
    const out = renderRaw(MOCK_HEADERS);
    assert.ok(out.includes('anthropic-ratelimit-unified-status: allowed'));
    assert.ok(out.includes('anthropic-ratelimit-unified-5h-utilization: 0.67'));
  });
});
