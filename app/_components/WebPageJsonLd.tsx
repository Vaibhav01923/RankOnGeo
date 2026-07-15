import { SITE_URL } from "@/lib/blog";

// Organization/WebSite embedded in full here (not just @id-referenced) because
// JSON-LD @id references only resolve within the same document — crawlers
// that fetch pages in isolation (GPTBot, ClaudeBot, PerplexityBot chief among
// them, given this product's own GEO focus) parse each page's markup on its
// own, so a bare {"@id": "..."} pointing at a node defined only on the
// homepage resolves to an empty stub everywhere else.
export const ORGANIZATION = {
  "@type": "Organization" as const,
  "@id": `${SITE_URL}/#organization`,
  name: "RankOnGeo",
  url: SITE_URL,
  logo: { "@type": "ImageObject" as const, url: `${SITE_URL}/logo.png`, width: 512, height: 512 },
};

export const WEBSITE = {
  "@type": "WebSite" as const,
  "@id": `${SITE_URL}/#website`,
  name: "RankOnGeo",
  url: SITE_URL,
};

export function WebPageJsonLd({ name, description, path, type = "WebPage" }: { name: string; description: string; path: string; type?: "WebPage" | "AboutPage" }) {
  const data = {
    "@context": "https://schema.org",
    "@type": type,
    name,
    description,
    url: `${SITE_URL}${path}`,
    isPartOf: WEBSITE,
    publisher: ORGANIZATION,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function BreadcrumbJsonLd({ items }: { items: { name: string; path: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
