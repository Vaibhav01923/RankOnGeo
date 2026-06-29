import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { runScanForBrand } from "@/lib/scan-engine";
import { AIEngine, BrandData } from "@/lib/types";

export const maxDuration = 300;

const DEFAULT_ENGINES: AIEngine[] = ["chatgpt", "claude", "gemini", "grok"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = serverClient();

  // Fetch all brands with their prompts
  const { data: brands, error } = await db
    .from("brands")
    .select("id, name, domain, niche, description, target_audience, competitors");

  if (error || !brands?.length) {
    const serviceKeySet = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceKeyValid = process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith("eyJ") ?? false;
    return NextResponse.json({
      scanned: 0,
      error: error?.message ?? "No brands found",
      debug: { serviceKeySet, serviceKeyValid, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30), keyFirst10: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10), keyCharCodes: Array.from(process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 5) ?? "").map(c => c.charCodeAt(0)) }
    });
  }

  let scanned = 0;
  const errors: string[] = [];

  for (const brandRow of brands) {
    const { data: promptRows } = await db
      .from("tracked_prompts")
      .select("id, text, category")
      .eq("brand_id", brandRow.id);

    if (!promptRows?.length) continue;

    const brand: BrandData = {
      id: brandRow.id,
      domain: brandRow.domain,
      name: brandRow.name,
      niche: brandRow.niche,
      description: brandRow.description,
      targetAudience: brandRow.target_audience,
      competitors: brandRow.competitors ?? [],
      trackedPrompts: promptRows.map((p) => ({ id: p.id, text: p.text, category: p.category })),
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await runScanForBrand(brand, DEFAULT_ENGINES, db as any);
      scanned++;
      console.log(`[cron] Scanned brand: ${brand.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${brand.name}: ${msg}`);
      console.error(`[cron] Failed to scan brand ${brand.name}:`, err);
    }
  }

  return NextResponse.json({ scanned, errors });
}
