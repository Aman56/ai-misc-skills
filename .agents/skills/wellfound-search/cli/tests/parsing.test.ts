import { test, expect, describe } from "bun:test"
import { parseSearchResults, parseJobDetail, filterByAge, extractNextData } from "../src/helpers.ts"

// Minimal fixture mirroring Wellfound's real __NEXT_DATA__ Apollo store shape:
// props.pageProps.apolloState.data["JobListing:<id>"] with a startup.__ref -> "Startup:<id>".
const nextData = {
  buildId: "test",
  props: {
    pageProps: {
      apolloState: {
        data: {
          "JobListing:4579450": {
            __typename: "JobListing",
            id: "4579450",
            slug: "software-engineer",
            title: "Software Engineer",
            compensation: "$110k – $155k",
            locationNames: ["Santa Clara"],
            acceptedRemoteLocationNames: ["United States"],
            remote: true,
            liveStartAt: 1786552154,
            startup: { __ref: "Startup:5268250" },
          },
          "Startup:5268250": {
            __typename: "Startup",
            id: "5268250",
            name: "Oklo",
            slug: "oklo",
          },
          "JobListing:9999": {
            // malformed: no title — must be skipped without breaking the rest
            __typename: "JobListing",
            id: "9999",
            startup: { __ref: "Startup:5268250" },
          },
        },
      },
    },
  },
}

const searchHtml = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
  nextData,
)}</script></body></html>`

const detailHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Software Engineer",
  datePosted: "2026-08-12T16:29:14Z",
  employmentType: "FULL_TIME",
  description: "<p>Join us!</p><ul><li>Write code</li><li>Ship it</li></ul>",
  hiringOrganization: { "@type": "Organization", name: "Oklo", sameAs: "https://oklo.com" },
  jobLocation: [
    { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Santa Clara", addressRegion: "CA", addressCountry: "US" } },
  ],
})}</script></head><body></body></html>`

describe("extractNextData", () => {
  test("parses the embedded JSON blob", () => {
    const d = extractNextData(searchHtml)
    expect(d?.buildId).toBe("test")
  })
  test("returns null when absent", () => {
    expect(extractNextData("<html></html>")).toBeNull()
  })
})

describe("parseSearchResults", () => {
  const cards = parseSearchResults(searchHtml)

  test("extracts the well-formed job and skips the malformed one", () => {
    expect(cards.length).toBe(1)
  })
  test("maps every required field", () => {
    const c = cards[0]
    expect(c.id).toBe("4579450")
    expect(c.title).toBe("Software Engineer")
    expect(c.company).toBe("Oklo")
    expect(c.companyUrl).toBe("https://wellfound.com/company/oklo")
    expect(c.location).toBe("Santa Clara (remote ok)")
    expect(c.date).toBe("2026-08-12")
    expect(c.url).toBe("https://wellfound.com/jobs/4579450-software-engineer")
    expect(c.compensation).toBe("$110k – $155k")
  })
  test("required keys are present (never omitted)", () => {
    for (const k of ["id", "title", "company", "location", "date", "url"]) {
      expect(Object.keys(cards[0])).toContain(k)
    }
  })
})

describe("parseJobDetail (JSON-LD)", () => {
  const d = parseJobDetail(detailHtml, "4579450", "https://wellfound.com/jobs/4579450-software-engineer")

  test("reads title, company, location, date", () => {
    expect(d.title).toBe("Software Engineer")
    expect(d.company).toBe("Oklo")
    expect(d.location).toBe("Santa Clara, CA, US")
    expect(d.date).toBe("2026-08-12")
    expect(d.employmentType).toBe("FULL_TIME")
  })
  test("description is decoded to readable text with line breaks", () => {
    expect(d.description).toContain("Join us!")
    expect(d.description).toContain("Write code")
    expect(d.description).not.toContain("<li>")
  })
  test("falls back gracefully when no JSON-LD present", () => {
    const empty = parseJobDetail("<html></html>", "1", "https://wellfound.com/jobs/1")
    expect(empty.title).toBe("(untitled)")
    expect(empty.description).toBeNull()
  })
})

describe("filterByAge", () => {
  const cards = [
    { date: new Date().toISOString().slice(0, 10) } as any,
    { date: "2000-01-01" } as any,
    { date: null } as any,
  ]
  test("drops old postings, keeps recent and unknown-date ones", () => {
    const kept = filterByAge(cards, 30)
    expect(kept.length).toBe(2)
  })
  test("no-op for a wide window", () => {
    expect(filterByAge(cards, 9999).length).toBe(3)
  })
})
