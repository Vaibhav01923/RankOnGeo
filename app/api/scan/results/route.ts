import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  const runId = req.nextUrl.searchParams.get("runId"); // optional — poll a specific run

  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const redact = await requiresPaywall(db, access.ownerId);

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

  // Free-tier/lapsed: the dashboard's own blur rendering already never reads
  // these fields (it substitutes stable fake values seeded from IDs, not
  // derived from the real data) — redacting here just makes that real
  // instead of enforced only by the client choosing not to display them.
  const results = (rows ?? []).map((r) => ({
    promptId: r.prompt_id,
    promptText: r.prompt_text,
    engine: r.engine,
    response: redact ? null : r.response,
    brandMentioned: redact ? false : r.brand_mentioned,
    brandRank: redact ? null : r.brand_rank,
    competitorMentions: redact ? [] : (r.competitor_mentions ?? []),
    citations: redact
      ? []
      : (r.citations ?? []).filter((u: string) => {
          try { return !new URL(u).hostname.endsWith("dataforseo.com"); } catch { return false; }
        }),
    scannedAt: r.scanned_at,
  }));

  // visibility_scores are written last — their presence means the scan finished
  const completed = (scoreRows?.length ?? 0) > 0;

  let scores = (scoreRows ?? []).map((s) => ({
    engine: s.engine,
    score: redact ? 0 : s.score,
    mentionCount: redact ? 0 : s.mention_count,
    totalPrompts: s.total_prompts, // kept — free-tier render uses this as a real denominator for its decoy fraction
    avgRank: redact ? null : s.avg_rank,
  }));

  // If scan finished but no scores (all failed), compute from results
  if (!completed && results.length > 0) scores = [];

  // If non-runId call and scores were written, compute overall from them
  const overallScore = redact
    ? 0
    : scores.length
    ? Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length)
    : 0;

  return NextResponse.json({ results, scores, overallScore, completed });
}
