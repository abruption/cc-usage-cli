/** Claude Code OAuth credentials file structure (~/.claude/.credentials.json) */
export interface CredentialsFile {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    refreshTokenExpiresAt: number;
    scopes: string[];
    subscriptionType: string;
    rateLimitTier: string;
  };
}

/** Parsed rate-limit info from API response headers */
export interface RateLimitInfo {
  status: string;
  fiveHour: {
    status: string;
    utilization: number;
    reset: number;
  };
  sevenDay: {
    status: string;
    utilization: number;
    reset: number;
  };
  representativeClaim: string;
  fallback: string;
  fallbackPercentage: number;
  overageStatus: string;
  overageDisabledReason: string;
  reset: number;
  subscriptionType: string;
  rateLimitTier: string;
  cachedAt?: number;
  source?: 'api' | 'statusline-fallback';
}

/** CLI options */
export interface CliOptions {
  json: boolean;
  raw: boolean;
  watch: number | false;
  fresh: boolean;
  version: boolean;
  help: boolean;
}
