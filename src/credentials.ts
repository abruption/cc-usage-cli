import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CredentialsFile } from './types.js';

/** Check if the access token is expired. */
export function isTokenExpired(creds: CredentialsFile): boolean {
  const exp = creds.claudeAiOauth?.expiresAt;
  return !!exp && Date.now() > exp;
}

export function credentialsPath(): string {
  return join(homedir(), '.claude', '.credentials.json');
}

export function readCredentials(): CredentialsFile {
  const fp = credentialsPath();

  let raw: string;
  try {
    raw = readFileSync(fp, 'utf-8');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        `Credentials file not found: ${fp}\n` +
        `Is Claude Code installed and logged in?`,
        { cause: err },
      );
    }
    throw new Error(`Failed to read credentials: ${fp} — ${(err as Error).message}`, { cause: err });
  }

  let data: CredentialsFile;
  try {
    data = JSON.parse(raw) as CredentialsFile;
  } catch {
    throw new Error(`Invalid JSON in credentials file: ${fp}`);
  }

  const oauth = data?.claudeAiOauth;
  if (!oauth?.accessToken) {
    throw new Error(
      `No OAuth access token found in ${fp}\n` +
      `Run Claude Code at least once to generate credentials.`
    );
  }

  return data;
}
