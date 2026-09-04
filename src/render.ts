import type { RateLimitInfo } from './types.js';

function formatCountdown(resetEpoch: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = resetEpoch - now;
  if (diff <= 0) return 'now';
  if (diff < 60) return '< 1m';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function progressBar(ratio: number, width = 20): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ' ' + (ratio * 100).toFixed(0).padStart(3) + '%';
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function statusLabel(status: string): string {
  if (status === 'allowed') return '\x1b[32m● allowed\x1b[0m';
  if (status === 'limited') return '\x1b[31m● limited\x1b[0m';
  return `● ${status}`;
}

function barColor(ratio: number): string {
  if (ratio >= 0.8) return '\x1b[31m';
  if (ratio >= 0.5) return '\x1b[33m';
  return '\x1b[32m';
}

function cleanTier(tier: string): string {
  return tier.replace(/^default_/, '');
}

export function renderDashboard(info: RateLimitInfo): string {
  const w = 44;
  const hr = '═'.repeat(w);
  const pad = (s: string, len: number) => s + ' '.repeat(Math.max(0, len - stripAnsi(s).length));

  const fiveBar = `${barColor(info.fiveHour.utilization)}${progressBar(info.fiveHour.utilization)}\x1b[0m`;
  const sevenBar = `${barColor(info.sevenDay.utilization)}${progressBar(info.sevenDay.utilization)}\x1b[0m`;

  const lines = [
    `╔${hr}╗`,
    `║  ${pad('Claude Code Rate Limits', w - 2)} ║`,
    `╠${hr}╣`,
    `║  ${pad(`5-Hour   ${fiveBar}`, w - 2)} ║`,
    `║  ${pad(`7-Day    ${sevenBar}`, w - 2)} ║`,
    `║  ${pad('', w - 2)} ║`,
    `║  ${pad(`Status: ${statusLabel(info.status)}`, w - 2)} ║`,
    `║  ${pad(`Tier: ${cleanTier(info.rateLimitTier)}`, w - 2)} ║`,
    `║  ${pad(`5h resets: ${formatCountdown(info.fiveHour.reset)}`, w - 2)} ║`,
    `║  ${pad(`7d resets: ${formatCountdown(info.sevenDay.reset)}`, w - 2)} ║`,
  ];

  if (info.fallback) {
    const fbPct = (info.fallbackPercentage * 100).toFixed(0);
    lines.push(`║  ${pad(`Fallback: ${info.fallback} (${fbPct}%)`, w - 2)} ║`);
  }

  lines.push(`╚${hr}╝`);

  const cacheNote = info.cachedAt
    ? `Cached ${Math.round((Date.now() - info.cachedAt) / 1000)}s ago · `
    : '';
  const sourceNote = info.source === 'statusline-fallback'
    ? '⚠️ Fallback (statusline) · free (included in subscription)'
    : 'Haiku probe · free (included in subscription)';
  lines.push(`  ${cacheNote}${sourceNote}`);

  return lines.join('\n');
}

export function renderRaw(rawHeaders: Record<string, string>): string {
  return Object.entries(rawHeaders)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}
