# Wellfound Jobs URL Reference

Public, unauthenticated Wellfound (formerly AngelList Talent) job pages used by this skill.
No API key. The data is server-rendered into the HTML, so a plain `fetch` (honest tool
User-Agent) retrieves it — no browser or JS execution required.

> Personal use only — keep volume low. Search paths below (`/jobs`, `/role`) are permitted by
> `wellfound.com/robots.txt`, which disallows `/search` and `/_jobs/` (neither is used here).

## Search

```
GET https://wellfound.com/jobs?q=<keywords>&l=<location>&remote=true&page=<n>
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `q` | Free-text keywords | `software engineer` |
| `l` | Location (soft filter — broadens, does not hard-restrict) | `New York` · `San Francisco` · `Remote` |
| `remote` | `true` to bias toward remote-friendly roles | `true` |
| `page` | 1-indexed pagination (~50 results/page) | `2`, `3`, … |

### Response structure

The page contains one `<script id="__NEXT_DATA__" type="application/json">…</script>` blob.
Job cards live in the Apollo normalized cache at:

```
props.pageProps.apolloState.data["JobListing:<id>"]
```

Relevant `JobListing` fields:

| Field | Meaning |
|-------|---------|
| `id` | Numeric job id |
| `title` | Job title |
| `slug` | URL slug (used to build the detail URL) |
| `compensation` | Human string, e.g. `"$110k – $155k"` (nullable) |
| `locationNames` | Array of place strings |
| `acceptedRemoteLocationNames` | Remote-eligible locations (array) |
| `remote` | Boolean |
| `liveStartAt` | Posting time, **Unix seconds** → formatted `YYYY-MM-DD` |
| `startup.__ref` | Reference into the same store, e.g. `"Startup:5268250"` |

The employer is resolved by following `startup.__ref` to
`props.pageProps.apolloState.data["Startup:<id>"]`, which has `name` and `slug`
(company URL = `https://wellfound.com/company/<slug>`).

> Note: the keyword `/jobs?q=` page keys jobs as `JobListing:<id>`. The role-taxonomy pages
> (`/role/r/<role>`, `/role/l/<role>/<location>`) key them as `JobListingSearchResult:<id>`
> and additionally carry a per-job `description`. This skill uses the `/jobs?q=` path because
> it supports arbitrary free-text queries; the role pages are an alternative if you ever need
> the list-level description without a `detail` fetch.

## Detail

```
GET https://wellfound.com/jobs/<id>-<slug>
```

The single-job page does **not** carry `__NEXT_DATA__`, but it does embed a JSON-LD block:

```
<script type="application/ld+json"> { "@type": "JobPosting", ... } </script>
```

`JobPosting` fields used: `title`, `hiringOrganization.name` / `.sameAs`, `datePosted`,
`jobLocation[].address` (locality/region/country), `employmentType`, `baseSalary.value`
(`minValue`/`maxValue`/`unitText`), `description` (HTML — stripped to text), and `url`
(apply link). A bare numeric id (`/jobs/<id>`) redirects to the canonical `<id>-<slug>` URL.

## Notes

- No authentication required; works with an honest tool User-Agent.
- `l=` is a soft/broadening filter — verify each result's `locationNames` for strict matches.
- Respect rate limits — the CLI backs off on 429/5xx.
- If Wellfound changes its Next.js data shape, the anchors to update are the
  `__NEXT_DATA__ → props.pageProps.apolloState.data` path (search) and the JSON-LD
  `JobPosting` block (detail).
