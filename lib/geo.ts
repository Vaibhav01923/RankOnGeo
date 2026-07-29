import { NextRequest } from "next/server";

// Vercel's edge network populates this header on every request in
// production/preview deployments — no external GeoIP service, no cost.
// It's absent entirely in local dev (expected) and Vercel sends the literal
// "XX" when it couldn't determine a country, which we treat the same as absent.
export function getCountryFromRequest(req: NextRequest): string | null {
  const country = req.headers.get("x-vercel-ip-country");
  if (!country || country.toUpperCase() === "XX") return null;
  return country.toUpperCase();
}
