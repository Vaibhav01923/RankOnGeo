import { SITE_URL } from "@/lib/blog";

// Links a secondary page back to the canonical Organization/WebSite entities
// declared once on the homepage (app/page.tsx) via @id, rather than
// re-declaring those entities on every page.
export function WebPageJsonLd({ name, description, path, type = "WebPage" }: { name: string; description: string; path: string; type?: "WebPage" | "AboutPage" }) {
  const data = {
    "@context": "https://schema.org",
    "@type": type,
    name,
    description,
    url: `${SITE_URL}${path}`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
