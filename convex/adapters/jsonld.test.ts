import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jsonld, parseEventPage } from "./jsonld";

const root = join(__dirname, "../../fixtures/jsonld");

function stubHttp(pages: Record<string, string>) {
  return {
    async text(url: string) {
      const page = pages[url];
      if (page === undefined) throw new Error(`no fixture for ${url}`);
      return page;
    },
  };
}

describe("jsonld fixtures", () => {
  for (const site of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    it(site.name, async () => {
      const dir = join(root, site.name);
      const { url } = JSON.parse(readFileSync(join(dir, "source.json"), "utf8")) as { url: string };
      const html = readFileSync(join(dir, "page.html"), "utf8");
      const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));
      expect(await jsonld.fetch({ url }, stubHttp({ [url]: html }))).toEqual(expected);
    });
  }
});

function page(...blocks: unknown[]) {
  const scripts = blocks.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`);
  return `<html><head>${scripts.join("")}</head></html>`;
}

const base = {
  "@type": "Event",
  name: "Hack Night",
  startDate: "2026-12-01T18:00:00-08:00",
  location: { "@type": "Place", name: "Noisebridge", address: "272 Capp St, San Francisco, CA" },
};

describe("jsonld parsing", () => {
  it("reads events from @graph and arrays and skips non-events", () => {
    const html = page(
      { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage", name: "x" }, { ...base, url: "/e/1" }] },
      [{ ...base, name: "Second", url: "/e/2" }],
    );
    const events = parseEventPage(html, "https://example.com/page");
    expect(events.map((event) => [event.title, event.sourceId])).toEqual([
      ["Hack Night", "https://example.com/e/1"],
      ["Second", "https://example.com/e/2"],
    ]);
  });

  it("skips online-only events but keeps mixed ones", () => {
    const html = page(
      { ...base, url: "/online", eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode" },
      { ...base, url: "/virtual", location: { "@type": "VirtualLocation", url: "https://zoom.us/j/1" } },
      {
        ...base,
        url: "/mixed",
        eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode",
        location: [{ "@type": "VirtualLocation", url: "https://zoom.us/j/1" }, base.location],
      },
    );
    const events = parseEventPage(html, "https://example.com/");
    expect(events.map((event) => event.url)).toEqual(["https://example.com/mixed"]);
    expect(events[0].location).toEqual({ name: "Noisebridge", address: "272 Capp St, San Francisco, CA" });
  });

  it("skips events marked private and pages marked noindex", () => {
    expect(parseEventPage(page({ ...base, isPrivate: true }), "https://example.com/")).toEqual([]);
    expect(parseEventPage(page({ ...base, visibility: "Private" }), "https://example.com/")).toEqual([]);
    const noindex = page(base).replace("<head>", '<head><meta name="robots" content="noindex, nofollow">');
    expect(parseEventPage(noindex, "https://example.com/")).toEqual([]);
  });

  it("maps offers, organizer, geo and image objects", () => {
    const html = page({
      ...base,
      location: {
        "@type": "Place",
        name: "Venue",
        address: { "@type": "PostalAddress", streetAddress: "1 Main St", addressLocality: "Oakland", addressRegion: "CA" },
        geo: { "@type": "GeoCoordinates", latitude: "37.8", longitude: "-122.27" },
      },
      offers: [
        { "@type": "Offer", price: "15.00", priceCurrency: "usd" },
        { "@type": "AggregateOffer", lowPrice: 5, highPrice: 40 },
      ],
      organizer: [{ "@type": "Organization", name: "Bay Hackers" }, { "@type": "Person", name: "Someone" }],
      image: { "@type": "ImageObject", url: "/cover.png" },
    });
    expect(parseEventPage(html, "https://example.com/e")).toEqual([
      {
        source: "jsonld",
        sourceId: "https://example.com/e",
        title: "Hack Night",
        startsAt: "2026-12-01T18:00:00-08:00",
        location: { name: "Venue", address: "1 Main St, Oakland, CA", lat: 37.8, lng: -122.27 },
        url: "https://example.com/e",
        organizer: "Bay Hackers",
        price: { min: 5, max: 40, currency: "USD" },
        imageUrl: "https://example.com/cover.png",
      },
    ]);
  });

  it("returns nothing from metadata without a start time", () => {
    const html = '<html><head><meta property="og:title" content="Party"></head></html>';
    expect(parseEventPage(html, "https://example.com/")).toEqual([]);
  });
});
