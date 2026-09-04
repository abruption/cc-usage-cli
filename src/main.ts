#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { probeRateLimits } from './api.js';
import { readCredentials, isTokenExpired } from './credentials.js';
import { readCache, writeCache } from './cache.js';
import { renderDashboard, renderRaw } from './render.js';
import { fallbackProbe } from './fallback.js';
import type { CliOptions, RateLimitInfo } from './types.js';

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    json: false, raw: false, watch: false, fresh: false, version: false, help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case '--json': opts.json = true; break;
      case '--raw': opts.raw = true; break;
      case '--watch': {
        const next = argv[i + 1];
        if (next && /^\d+$/.test(next)) { opts.watch = parseInt(next, 10); i++; }
        else { opts.watch = 60; }
        break;
      }
      case '--fresh': case '--no-cache': case '--refresh': opts.fresh = true; break;
      case '--version': case '-v': opts.version = true; break;
      case '--help': case '-h': opts.help = true; break;
      default: console.error(`Unknown option: ${arg}`); process.exit(1);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
cc-usage-cli — Real-time Claude Code rate-limit dashboard

Usage:
  cc-usage-cli                Show rate limits (cached up to 60s)
  cc-usage-cli --json         Output as JSON
  cc-usage-cli --raw          Show raw response headers
  cc-usage-cli --watch [sec]  Poll every N seconds (default: 60)
  cc-usage-cli --fresh        Skip cache, always probe
  cc-usage-cli --version      Show version
  cc-usage-cli --help         Show this help

How it works:
  Reads ~/.claude/.credentials.json for your OAuth token, sends a
  minimal Haiku 4.5 request (~$0.000006), and extracts rate-limit
  info from response headers.

  Results are cached for 60 seconds at ~/.cache/cc-usage-cli/.
`.trim());
}

function printVersion(): void {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(dir, '..', '..', 'package.json'), 'utf-8'));
    console.log(`cc-usage-cli v${pkg.version}`);
  } catch {
    console.log('cc-usage-cli (version unknown)');
  }
}

async function fetchLimits(fresh: boolean): Promise<{
  rateLimits: RateLimitInfo;
  rawHeaders: Record<string, string>;
}> {
  if (!fresh) {
    const cached = readCache();
    if (cached) return { rateLimits: cached.rateLimits, rawHeaders: cached.rawHeaders };
  }

  // Check if token is expired — skip API probe and go straight to fallback
  let skipPrimary = false;
  try {
    const creds = readCredentials();
    if (isTokenExpired(creds)) {
      console.error('⚠️  Token expired — using statusline fallback (auto-refreshes token)...');
      skipPrimary = true;
    }
  } catch {
    // Credentials unreadable — fallback will handle it
    skipPrimary = true;
  }

  if (!skipPrimary) {
    try {
      const result = await probeRateLimits();
      result.rateLimits.source = 'api';
      writeCache(result.rateLimits, result.rawHeaders);
      return result;
    } catch (primaryErr) {
      console.error(`⚠️  Primary probe failed: ${(primaryErr as Error).message.split('\n')[0]}`);
      console.error('    Falling back to statusline capture...');
    }
  }

  // Fallback: statusline capture via claude -p
  const rateLimits = await fallbackProbe();
  rateLimits.source = 'statusline-fallback';
  const rawHeaders: Record<string, string> = {};
  writeCache(rateLimits, rawHeaders);
  return { rateLimits, rawHeaders };
}

function output(opts: CliOptions, rateLimits: RateLimitInfo, rawHeaders: Record<string, string>): void {
  if (opts.json) console.log(JSON.stringify(rateLimits, null, 2));
  else if (opts.raw) console.log(renderRaw(rawHeaders));
  else console.log(renderDashboard(rateLimits));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  if (opts.help) { printHelp(); return; }
  if (opts.version) { printVersion(); return; }

  try {
    if (opts.watch !== false) {
      const interval = opts.watch * 1000;
      for (;;) {
        try {
          const { rateLimits, rawHeaders } = await fetchLimits(true);
          console.clear();
          output(opts, rateLimits, rawHeaders);
          console.log(`\n  Polling every ${opts.watch}s · Last: ${new Date().toLocaleTimeString()} · Ctrl+C to stop`);
        } catch (err) {
          console.error(`\n⚠️  ${(err as Error).message}`);
        }
        await new Promise(r => setTimeout(r, interval));
      }
    } else {
      const { rateLimits, rawHeaders } = await fetchLimits(opts.fresh);
      output(opts, rateLimits, rawHeaders);
    }
  } catch (err) {
    console.error(`\n⚠️  ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
