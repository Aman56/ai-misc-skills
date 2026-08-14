# wellfound-cli

Zero-dependency CLI for searching startup/tech jobs on [Wellfound](https://wellfound.com)
(formerly AngelList Talent). Runs with just `bun` — `bun install` only pulls dev TypeScript types.

**Personal use only** — reads Wellfound's public pages; keep volume low.

## Install

```bash
cd .agents/skills/wellfound-search/cli && bun install && cd ../../../..
```

## Usage

```bash
# Search (provide at least one of -q / -l)
bun run src/cli.ts search -q "software engineer" -l "New York" --format table
bun run src/cli.ts search -q "data scientist" --remote --jobage 30 --format table

# Detail (id, id-slug, or full URL)
bun run src/cli.ts detail 4579450-software-engineer --format plain
```

See [`../SKILL.md`](../SKILL.md) for the full flag reference and
[`../url-reference.md`](../url-reference.md) for the endpoint/parsing documentation.

## Develop

```bash
bun run typecheck   # tsc --noEmit
bun run test        # bun test (offline parsing/validation + one live smoke test)
```

The parsing and flag-validation tests run offline. One live smoke test hits Wellfound and
skips (rather than fails) if the network or portal is unavailable.
