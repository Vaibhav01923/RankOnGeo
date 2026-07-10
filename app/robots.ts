import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/setup", "/article", "/admin", "/api/", "/auth"],
    },
    sitemap: "https://rankongeo.com/sitemap.xml",
  };
}
