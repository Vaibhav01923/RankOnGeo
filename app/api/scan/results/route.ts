import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Get the most recent scan run for this brand
  const { data: latestRun } = await db
    .from("scan_runs")
    .select("id")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!latestRun) return NextResponse.json({ results: [] });

  const { data: rows, error } = await db
    .from("scan_results")
    .select("prompt_id, prompt_text, engine, response, brand_mentioned, brand_rank, competitor_mentions, citations, scanned_at")
    .eq("scan_run_id", latestRun.id)
    .eq("brand_id", brandId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (rows ?? []).map((r) => ({
    promptId: r.prompt_id,
    promptText: r.prompt_text,
    engine: r.engine,
    response: r.response,
    brandMentioned: r.brand_mentioned,
    brandRank: r.brand_rank,
    competitorMentions: r.competitor_mentions ?? [],
    citations: r.citations ?? [],
    scannedAt: r.scanned_at,
  }));

  return NextResponse.json({ results });
}
