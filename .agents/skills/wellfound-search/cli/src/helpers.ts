// Data source: Wellfound (formerly AngelList Talent) public job pages. No authentication.
// Wellfound is a Next.js app that server-renders its data into a <script id="__NEXT_DATA__">
// JSON blob (an Apollo normalized cache). The search results page carries the job cards there;
// the single-job page carries a JSON-LD <script type="application/ld+json"> JobPosting we use
// for the full description. Both are stable, structured, and parseable with zero dependencies.
//
// Personal use only — keep volume low. The search paths used here (/jobs, /role) are permitted
// by wellfound.com/robots.txt (which disallows /search and /_jobs/, not used here).

export const ORIGIN = "https://wellfound.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; wellfound-search-cli/1.0)"

/** Fetch a page's HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  compensation: string | null
  remote: boolean | null
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  description: string | null
  employmentType: string | null
  compensation: string | null
  applyUrl: string | null
}

/** Pull and JSON.parse the <script id="__NEXT_DATA__"> blob. Returns null if absent/invalid. */
export function extractNextData(html: string): any | null {
  const marker = html.indexOf('<script id="__NEXT_DATA__"')
  if (marker === -1) return null
  const open = html.indexOf(">", marker)
  const close = html.indexOf("</script>", open)
  if (open === -1 || close === -1) return null
  try {
    return JSON.parse(html.slice(open + 1, close))
  } catch {
    return null
  }
}

/** Locate the Apollo normalized store (`{ "JobListing:123": {...}, "Startup:9": {...} }`). */
function apolloStore(next: any): Record<string, any> {
  return next?.props?.pageProps?.apolloState?.data ?? {}
}

/** Unix seconds -> "YYYY-MM-DD", or null if unparseable. */
function isoDate(epochSeconds: unknown): string | null {
  const n = typeof epochSeconds === "number" ? epochSeconds : Number(epochSeconds)
  if (!n || Number.isNaN(n)) return null
  const d = new Date(n * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function joinLocations(names: unknown, remote: boolean): string | null {
  const list = Array.isArray(names) ? names.filter((x) => typeof x === "string" && x) : []
  const base = list.join(", ")
  if (base && remote) return `${base} (remote ok)`
  if (base) return base
  return remote ? "Remote" : null
}

/**
 * Parse the search-results page. Each job is an Apollo entry keyed `JobListing:<id>`,
 * with the employer resolved through the entry's `startup.__ref` -> `Startup:<id>`.
 * Entries are read independently so one malformed record cannot break the rest.
 */
export function parseSearchResults(html: string): JobCard[] {
  const next = extractNextData(html)
  if (!next) return []
  const store = apolloStore(next)
  const results: JobCard[] = []

  for (const key of Object.keys(store)) {
    if (!/^JobListing:\d+/.test(key)) continue
    const j = store[key]
    try {
      const id = String(j.id ?? key.split(":")[1])
      const title = typeof j.title === "string" ? j.title : null
      if (!id || !title) continue
      const slug = typeof j.slug === "string" ? j.slug : ""
      const remote = j.remote === true

      let company: string | null = null
      let companyUrl: string | null = null
      const ref = j.startup?.__ref
      if (ref && store[ref]) {
        const st = store[ref]
        company = typeof st.name === "string" ? st.name : null
        if (typeof st.slug === "string" && st.slug) companyUrl = `${ORIGIN}/company/${st.slug}`
      }

      results.push({
        id,
        title,
        company,
        companyUrl,
        location: joinLocations(j.locationNames, remote),
        date: isoDate(j.liveStartAt),
        url: `${ORIGIN}/jobs/${id}${slug ? `-${slug}` : ""}`,
        compensation: typeof j.compensation === "string" ? j.compensation : null,
        remote,
      })
    } catch {
      continue
    }
  }
  return results
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

/** Strip HTML tags from a JSON-LD description, preserving paragraph/line breaks. */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function placeString(loc: any): string | null {
  const one = Array.isArray(loc) ? loc[0] : loc
  const addr = one?.address
  if (!addr) return null
  const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(
    (x) => typeof x === "string" && x,
  )
  return parts.length ? parts.join(", ") : null
}

/**
 * Parse a single job page. Wellfound emits a JSON-LD `JobPosting` on the detail page
 * (title, hiringOrganization, datePosted, jobLocation, full description, employmentType).
 */
export function parseJobDetail(html: string, id: string, url: string): JobDetail {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  let posting: any = null
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1])
      const type = Array.isArray(obj["@type"]) ? obj["@type"].join(",") : obj["@type"]
      if (typeof type === "string" && /JobPosting/i.test(type)) {
        posting = obj
        break
      }
    } catch {
      continue
    }
  }

  if (!posting) {
    return {
      id,
      title: "(untitled)",
      company: null,
      companyUrl: null,
      location: null,
      date: null,
      url,
      description: null,
      employmentType: null,
      compensation: null,
      applyUrl: null,
    }
  }

  const company =
    typeof posting.hiringOrganization?.name === "string" ? posting.hiringOrganization.name : null
  const companyUrl =
    typeof posting.hiringOrganization?.sameAs === "string" ? posting.hiringOrganization.sameAs : null
  const date =
    typeof posting.datePosted === "string" ? posting.datePosted.slice(0, 10) : null
  const employmentType = Array.isArray(posting.employmentType)
    ? posting.employmentType.join(", ")
    : typeof posting.employmentType === "string"
      ? posting.employmentType
      : null

  let compensation: string | null = null
  const sal = posting.baseSalary?.value
  if (sal && (sal.minValue || sal.maxValue)) {
    const unit = sal.unitText ? ` /${String(sal.unitText).toLowerCase()}` : ""
    compensation = `${sal.minValue ?? "?"} – ${sal.maxValue ?? "?"}${unit}`
  }

  return {
    id,
    title: typeof posting.title === "string" ? posting.title : "(untitled)",
    company,
    companyUrl,
    location: placeString(posting.jobLocation),
    date,
    url,
    description: typeof posting.description === "string" ? htmlToText(posting.description) : null,
    employmentType,
    compensation,
    applyUrl: typeof posting.url === "string" ? posting.url : url,
  }
}

/** Filter cards to those posted within `days` days (client-side; Wellfound has no age param). */
export function filterByAge(cards: JobCard[], days: number): JobCard[] {
  if (!days || days <= 0 || days >= 9999) return cards
  const cutoff = Date.now() - days * 86400 * 1000
  return cards.filter((c) => {
    if (!c.date) return true // keep unknown-date postings, flagged by null date
    const t = new Date(c.date).getTime()
    return Number.isNaN(t) || t >= cutoff
  })
}
