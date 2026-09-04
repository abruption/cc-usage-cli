import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { RateLimitInfo } from './types.js';

const CACHE_DIR = join(homedir(), '.cache', 'cc-usage-cli');
const CACHE_FILE = join(CACHE_DIR, 'last-probe.json');
const TTL_MS = 60_000;

interface CacheEntry {
  rateLimits: RateLimitInfo;
  rawHeaders: Record<string, string>;
  timestamp: number;
}

export function readCache(): CacheEntry | null {
  try {
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.timestamp > TTL_MS) return null;
    entry.rateLimits.cachedAt = entry.timestamp;
    return entry;
  } catch {
    return null;
  }
}

export function writeCache(rateLimits: RateLimitInfo, rawHeaders: Record<string, string>): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = { rateLimits, rawHeaders, timestamp: Date.now() };
    writeFileSync(CACHE_FILE, JSON.stringify(entry), 'utf-8');
  } catch {
    // Non-fatal
  }
}
