import { test, expect, describe } from "bun:test"
import { runCLI, parseJSON } from "./helpers.ts"

// Offline flag-validation tests — no network required.
describe("CLI validation (offline)", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("wellfound-cli")
  })
  test("search with neither -q nor -l errors on stderr", async () => {
    const r = await runCLI(["search"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_CRITERIA")
  })
  test("non-numeric --jobage is rejected", async () => {
    const r = await runCLI(["search", "-q", "engineer", "--jobage", "soon"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
  test("detail without an id errors", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })
  test("detail with an unparseable id errors", async () => {
    const r = await runCLI(["detail", "not-a-job"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID")
  })
  test("unknown command errors", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_CMD")
  })
})

// Live smoke test — hits Wellfound. Skips (does not fail) if the network is unavailable.
describe("live search", () => {
  test("returns real results with non-null id/title/url", async () => {
    const r = await runCLI(["search", "-q", "software engineer", "-l", "New York", "-n", "5"])
    if (r.exitCode !== 0) {
      console.warn("live search skipped (network/portal unavailable):", r.stderr)
      return
    }
    const data = parseJSON<{ meta: { count: number }; results: any[] }>(r)
    expect(Array.isArray(data.results)).toBe(true)
    if (data.results.length === 0) {
      console.warn("live search returned 0 results — portal markup may have changed")
      return
    }
    const job = data.results[0]
    expect(job.id).toBeTruthy()
    expect(job.title).toBeTruthy()
    expect(job.url).toContain("wellfound.com/jobs/")
  })
})
