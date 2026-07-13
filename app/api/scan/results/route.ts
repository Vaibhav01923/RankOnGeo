import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  const runId = req.nextUrl.searchParams.get("runId"); // optional — poll a specific run

  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // Resolve which scan_run to read
  let resolvedRunId: string;
  if (runId) {
    resolvedRunId = runId;
  } else {
    const { data: latestRun } = await db
      .from("scan_runs")
      .select("id")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!latestRun) return NextResponse.json({ results: [], scores: [], overallScore: 0, completed: true });
    resolvedRunId = latestRun.id;
  }

  const [{ data: rows, error }, { data: scoreRows }] = await Promise.all([
    db.from("scan_results")
      .select("prompt_id, prompt_text, engine, response, brand_mentioned, brand_rank, competitor_mentions, citations, scanned_at")
      .eq("scan_run_id", resolvedRunId)
      .eq("brand_id", brandId),
    db.from("visibility_scores")
      .select("engine, score, mention_count, total_prompts, avg_rank")
      .eq("scan_run_id", resolvedRunId),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (rows ?? []).map((r) => ({
    promptId: r.prompt_id,
    promptText: r.prompt_text,
    engine: r.engine,
    response: r.response,
    brandMentioned: r.brand_mentioned,
    brandRank: r.brand_rank,
    competitorMentions: r.competitor_mentions ?? [],
    citations: (r.citations ?? []).filter((u: string) => {
      try { return !new URL(u).hostname.endsWith("dataforseo.com"); } catch { return false; }
    }),
    scannedAt: r.scanned_at,
  }));

  // visibility_scores are written last — their presence means the scan finished
  const completed = (scoreRows?.length ?? 0) > 0;

  let scores = (scoreRows ?? []).map((s) => ({
    engine: s.engine,
    score: s.score,
    mentionCount: s.mention_count,
    totalPrompts: s.total_prompts,
    avgRank: s.avg_rank,
  }));

  // If scan finished but no scores (all failed), compute from results
  if (!completed && results.length > 0) scores = [];

  // If non-runId call and scores were written, compute overall from them
  const overallScore = scores.length
    ? Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length)
    : 0;

  return NextResponse.json({ results, scores, overallScore, completed });
}
