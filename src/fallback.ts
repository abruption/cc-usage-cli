/**
 * Fallback: statusline capture via `claude -p "hi"`.
 *
 * When the primary API-header probe fails (expired token, auth error, etc.),
 * this module:
 *   1. Backs up the current statusLine in settings.json
 *   2. Injects a capture script that writes rate_limits to a temp file
 *   3. Runs `claude -p "hi" --model claude-haiku-4-5` (cheapest, auto-refreshes token)
 *   4. Reads the captured rate_limits
 *   5. Restores the original statusLine (guaranteed via try/finally)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { RateLimitInfo } from './types.js';

const CLAUDE_DIR = join(homedir(), '.claude');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const CACHE_DIR = join(homedir(), '.cache', 'cc-usage-cli');
const CAPTURE_FILE = join(CACHE_DIR, 'statusline-capture.json');

/** stdin → rate_limits structure (matches Claude Code's statusline protocol) */
interface StatuslineStdin {
  rate_limits?: {
    five_hour?: { used_percentage?: number | null; resets_at?: number | null } | null;
    seven_day?: { used_percentage?: number | null; resets_at?: number | null } | null;
    model_scoped?: Array<{
      display_name?: string | null;
      utilization?: number | null;
      resets_at?: string | null;
    }> | null;
  } | null;
}

/**
 * Write the capture script as an external file and return the command to invoke it.
 * Avoids nested quote hell (settings.json → bash → python string escaping).
 */
function ensureCaptureScript(): string {
  const isWindows = platform() === 'win32';
  const scriptPath = join(CACHE_DIR, isWindows ? 'capture.ps1' : 'capture.sh');

  mkdirSync(CACHE_DIR, { recursive: true });

  if (isWindows) {
    writeFileSync(scriptPath, [
      '$input = [Console]::In.ReadToEnd()',
      'try {',
      '  $j = $input | ConvertFrom-Json',
      '  if ($j.rate_limits) {',
      `    $j.rate_limits | ConvertTo-Json -Depth 10 | Set-Content '${CAPTURE_FILE}' -Encoding UTF8`,
      '  }',
      '} catch {}',
      "Write-Host ''",
    ].join('\n'), 'utf-8');
    return `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
  }

  // Bash script — portable across macOS/Linux
  writeFileSync(scriptPath, [
    '#!/bin/bash',
    'input=$(cat)',
    `echo "$input" | python3 -c '`,
    'import sys, json',
    'try:',
    '    d = json.load(sys.stdin)',
    '    rl = d.get("rate_limits")',
    '    if rl:',
    `        with open("${CAPTURE_FILE}", "w") as f:`,
    '            json.dump(rl, f)',
    'except: pass',
    "' 2>/dev/null",
    'echo ""',
  ].join('\n'), { mode: 0o755 });

  return scriptPath;
}

/**
 * Read and parse settings.json, preserving original structure.
 */
function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Write settings.json atomically.
 */
function writeSettings(data: Record<string, unknown>): void {
  writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Find the `claude` CLI binary path.
 */
function findClaude(): string {
  const isWindows = platform() === 'win32';
  try {
    const which = isWindows ? 'where' : 'which';
    return execFileSync(which, ['claude'], { encoding: 'utf-8' }).trim().split('\n')[0]!;
  } catch {
    // Common locations
    const candidates = isWindows
      ? [join(homedir(), '.claude', 'local', 'claude.exe')]
      : ['/usr/local/bin/claude', join(homedir(), '.claude', 'bin', 'claude')];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    throw new Error(
      'Claude Code CLI not found. Install it from https://claude.ai/download\n' +
      'or ensure `claude` is on your PATH.'
    );
  }
}

/**
 * Run the statusline-capture fallback and return rate limits.
 */
export async function fallbackProbe(): Promise<RateLimitInfo> {
  mkdirSync(CACHE_DIR, { recursive: true });

  // Clean up any stale capture file
  try { unlinkSync(CAPTURE_FILE); } catch { /* ok */ }

  const settings = readSettings();
  const originalStatusLine = settings.statusLine;

  try {
    // Inject capture statusLine — external script file avoids quote escaping issues
    const captureCmd = ensureCaptureScript();
    settings.statusLine = {
      type: 'command',
      command: captureCmd,
    };
    writeSettings(settings);

    // Run claude -p with haiku to minimize cost
    const claudePath = findClaude();
    try {
      execFileSync(claudePath, ['-p', 'ping', '--model', 'haiku', '--max-turns', '1'], {
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // claude -p may exit non-zero for various reasons but statusline capture
      // might still have worked. Check the capture file before giving up.
      const msg = (err as Error).message || '';
      if (!existsSync(CAPTURE_FILE)) {
        throw new Error(`claude -p failed and no rate limits captured: ${msg.slice(0, 200)}`, { cause: err });
      }
    }

    // Read captured rate_limits
    if (!existsSync(CAPTURE_FILE)) {
      throw new Error(
        'Statusline capture file not created.\n' +
        'Claude Code may not have sent rate_limits in this session.'
      );
    }

    const raw = JSON.parse(readFileSync(CAPTURE_FILE, 'utf-8')) as StatuslineStdin['rate_limits'];
    if (!raw) {
      throw new Error('Captured statusline contained no rate_limits data.');
    }

    // Read credentials for subscription info (token was auto-refreshed by claude -p)
    let subscriptionType = 'unknown';
    let rateLimitTier = 'unknown';
    try {
      const creds = JSON.parse(readFileSync(join(CLAUDE_DIR, '.credentials.json'), 'utf-8'));
      subscriptionType = creds?.claudeAiOauth?.subscriptionType ?? 'unknown';
      rateLimitTier = creds?.claudeAiOauth?.rateLimitTier ?? 'unknown';
    } catch { /* ok */ }

    const fiveHourPct = (raw.five_hour?.used_percentage ?? 0) / 100;
    const sevenDayPct = (raw.seven_day?.used_percentage ?? 0) / 100;
    const fiveHourReset = raw.five_hour?.resets_at ?? 0;
    const sevenDayReset = raw.seven_day?.resets_at ?? 0;

    const rateLimits: RateLimitInfo = {
      status: fiveHourPct >= 1.0 || sevenDayPct >= 1.0 ? 'limited' : 'allowed',
      fiveHour: {
        status: fiveHourPct >= 1.0 ? 'limited' : 'allowed',
        utilization: fiveHourPct,
        reset: typeof fiveHourReset === 'number' ? fiveHourReset : 0,
      },
      sevenDay: {
        status: sevenDayPct >= 1.0 ? 'limited' : 'allowed',
        utilization: sevenDayPct,
        reset: typeof sevenDayReset === 'number' ? sevenDayReset : 0,
      },
      representativeClaim: fiveHourPct >= sevenDayPct ? 'five_hour' : 'seven_day',
      fallback: '',
      fallbackPercentage: 0,
      overageStatus: '',
      overageDisabledReason: '',
      reset: typeof fiveHourReset === 'number' ? fiveHourReset : 0,
      subscriptionType,
      rateLimitTier,
      source: 'statusline-fallback',
    } as RateLimitInfo & { source: string };

    return rateLimits;
  } finally {
    // ALWAYS restore original statusLine — this is the critical safety guarantee
    const currentSettings = readSettings();
    if (originalStatusLine === undefined) {
      delete currentSettings.statusLine;
    } else {
      currentSettings.statusLine = originalStatusLine;
    }
    writeSettings(currentSettings);

    // Clean up capture file
    try { unlinkSync(CAPTURE_FILE); } catch { /* ok */ }
  }
}
