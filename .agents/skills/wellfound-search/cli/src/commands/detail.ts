import { ORIGIN, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept a full Wellfound job URL, an `<id>-<slug>` token, or a bare numeric id.
 * Returns the canonical job-page URL to fetch (bare ids resolve via redirect).
 */
function resolveUrl(input: string): string | null {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return /wellfound\.com\/jobs\//i.test(trimmed) ? trimmed.split("?")[0] : null
  }
  // "<id>" or "<id>-<slug>"
  if (/^\d{4,}(-[\w-]+)?$/.test(trimmed)) return `${ORIGIN}/jobs/${trimmed}`
  return null
}

function idFromUrl(url: string): string {
  const m = url.match(/\/jobs\/(\d+)/)
  return m ? m[1] : url
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const url = resolveUrl(opts.id)
  if (!url) {
    writeError(
      `Could not parse a Wellfound job id/url from "${opts.id}" (expected a numeric id, "<id>-<slug>", or a wellfound.com/jobs/... URL)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, idFromUrl(url), url)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.compensation ? `Compensation: ${job.compensation}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.date ? `Posted: ${job.date}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl && job.applyUrl !== job.url ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
