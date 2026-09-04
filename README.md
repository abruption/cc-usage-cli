# cc-usage-cli

Real-time Claude Code subscription rate-limit dashboard.

Reads your local OAuth credentials, sends a minimal Haiku probe (free — included in your subscription), and displays your current 5-hour and 7-day utilization from the response headers.

```
╔══════════════════════════════════════════╗
║  Claude Code Rate Limits                 ║
╠══════════════════════════════════════════╣
║  5-Hour   ████████████░░░░░░░░  67%     ║
║  7-Day    ██████████░░░░░░░░░░  51%     ║
║                                          ║
║  Status: ● allowed                       ║
║  Tier: claude_max_20x                    ║
║  5h resets: 2h 13m                       ║
║  7d resets: 3d 2h                        ║
║  Fallback: available (50%)               ║
╚══════════════════════════════════════════╝
  Haiku probe · free (included in subscription)
```

## Install

```bash
npm install -g cc-usage-cli
```

Or run directly:

```bash
npx cc-usage-cli
```

## Usage

```bash
cc-usage-cli                # Dashboard (cached up to 60s)
cc-usage-cli --json         # Machine-readable JSON
cc-usage-cli --raw          # Raw response headers
cc-usage-cli --watch [sec]  # Poll every N seconds (default: 60)
cc-usage-cli --fresh        # Skip cache, always probe
cc-usage-cli --version
cc-usage-cli --help
```

## How it works

1. Reads `~/.claude/.credentials.json` (created by Claude Code on login)
2. Sends a minimal API request (Haiku 4.5, `max_tokens: 1`)
3. Extracts `anthropic-ratelimit-unified-*` headers from the response
4. Displays 5-hour and 7-day utilization, reset times, and status

Results are cached for 60 seconds at `~/.cache/cc-usage-cli/`.

## Platform support

| OS | Credentials path | Tested |
|---|---|---|
| macOS | `~/.claude/.credentials.json` | ✅ |
| Linux | `~/.claude/.credentials.json` | ✅ |
| Windows | `%USERPROFILE%\.claude\.credentials.json` | ✅ |

## How is this different?

| | cc-usage-cli | ccquota / claude-quota | ccusage |
|---|---|---|---|
| **What** | Current rate limits (live) | Current limits (scraped) | Historical usage (post-hoc) |
| **Method** | API probe (response headers) | tmux → `/usage` scrape | Local JSONL analysis |
| **Speed** | < 1 second | 5–10 seconds | Instant (local files) |
| **Windows** | ✅ | ❌ (needs tmux) | ✅ |
| **Cost** | Free (included in subscription) | Free | Free |
| **Structured** | JSON headers | ANSI text parse | Structured |

**cc-usage-cli** and **ccusage** are complementary: ccusage tells you *how much you've used* (past), cc-usage-cli tells you *how much is left* (present).

## Requirements

- Node.js ≥ 18
- Active Claude Code subscription (Pro, Max, or Team)
- Claude Code must have been run at least once (to generate credentials)

## Token expiry

The OAuth access token expires after ~1 hour. Claude Code automatically refreshes it when running. If the primary API probe fails (expired token, auth error), cc-usage-cli automatically falls back to a statusline-capture method via `claude -p` which also refreshes the token. Both methods are free (included in your Claude Code subscription) and require no manual intervention.

## License

MIT

