---
name: wellfound-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for startup, tech, or venture-backed
  jobs — software, data, product, design, engineering, marketing, and operations roles at
  startups and scale-ups, primarily in the United States but also remote and worldwide.
  Invoke for open positions, vacancies, and hiring at startups, or to look up a specific
  Wellfound (formerly AngelList Talent) job posting. Trigger phrases: startup jobs, tech
  jobs, Wellfound, AngelList, find a startup job, search startup roles, remote startup jobs,
  "are there any X jobs at startups in <place>", look up this Wellfound posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/wellfound-search/cli/src/cli.ts *)
---

# Wellfound Search Skill

Search live startup and tech job listings from [Wellfound](https://wellfound.com) (formerly
AngelList Talent) — the largest startup-focused job board in the US market. No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`.

Wellfound server-renders its search results and job details into the page (a Next.js
`__NEXT_DATA__` Apollo cache for search, JSON-LD `JobPosting` for detail), so a plain `fetch`
gets structured data without a browser. Free-text keyword + location search, US-first but works
for any location and for remote.

## ⚠️ Personal use only

This uses Wellfound's public job pages. The search paths it hits (`/jobs`, `/role`) are
permitted by [wellfound.com/robots.txt](https://wellfound.com/robots.txt) (which disallows
`/search` and `/_jobs/`, not used here), but **keep volume low and don't use it commercially
or for bulk data collection.** Run it on your own responsibility.

## When to use this skill

- Search for startup / tech job openings by keyword and location (US or anywhere), or remote
- Filter to remote-friendly roles, or to recent postings
- Get the full description, compensation, and apply link of a specific Wellfound job

## Commands

### Search job listings

```bash
bun run .agents/skills/wellfound-search/cli/src/cli.ts search [--query "<text>"] [--location "<place>"] [flags]
```

Key flags (provide at least one of `--query` or `--location`):
- `--query <text>` / `-q <text>` — keyword search (title, skill, role), e.g. `"software engineer"`. Recommended.
- `--location <text>` / `-l <text>` — a place string, e.g. `"New York"`, `"San Francisco"`, `"Remote"`. See the location note under **Notes**.
- `--remote` — restrict to remote-friendly roles.
- `--jobage <days>` — keep only postings within N days (client-side filter; Wellfound has no server-side age parameter).
- `--page <n>` — page number (1-indexed, ~50 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/wellfound-search/cli/src/cli.ts detail <id|"id-slug"|url> [--format json|plain]
```

Pass the job ID from `search` results (e.g. `4579450`), the `id-slug` token
(`4579450-software-engineer`), or a full `wellfound.com/jobs/...` URL. Returns the full
description, company, location, compensation, employment type, and apply link (parsed from the
posting's JSON-LD `JobPosting`).

## Usage examples

```bash
# Software engineer roles near New York
bun run .agents/skills/wellfound-search/cli/src/cli.ts search -q "software engineer" -l "New York" --format table

# Data scientist roles in San Francisco, posted in the last 30 days
bun run .agents/skills/wellfound-search/cli/src/cli.ts search -q "data scientist" -l "San Francisco" --jobage 30 --format table

# Product manager roles, remote only
bun run .agents/skills/wellfound-search/cli/src/cli.ts search -q "product manager" --remote --format table

# Page 2 of frontend roles in Austin
bun run .agents/skills/wellfound-search/cli/src/cli.ts search -q "frontend engineer" -l "Austin" --page 2 --format table

# Full details for a specific job
bun run .agents/skills/wellfound-search/cli/src/cli.ts detail 4579450-software-engineer --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON results follow the shared portal shape: `{ "meta": { "count", "page" }, "results": [...] }`,
each result carrying at least `id`, `title`, `company`, `location`, `date`, `url` (plus
`compensation` and `remote`). All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from Wellfound's public pages — no credentials required.
- **Location is a soft filter.** Wellfound's `l=` parameter broadens rather than hard-restricts:
  a search for `"New York"` may include nearby-metro and remote-friendly roles. Treat the
  `location` field on each result as the source of truth and filter downstream if you need a
  strict geographic match.
- Compensation and remote status are surfaced when Wellfound provides them (`null` otherwise).
- `date` is the posting's `liveStartAt` as `YYYY-MM-DD`; `--jobage` filters on it client-side,
  and postings with an unknown date are kept (with `date: null`) rather than dropped.
- Wellfound may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep volume low.
