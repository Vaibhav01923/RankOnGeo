import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const db = clientFromRequest(req);

  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Verify the requester owns the brand or is a teammate of its owner
  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ runs: [] });
  const redact = await requiresPaywall(db, access.ownerId);

  const { data: runs, error } = await db
    .from("scan_runs")
    .select(`
      id,
      engines,
      overall_score,
      created_at,
      visibility_scores (
        engine,
        score,
        mention_count,
        total_prompts,
        avg_rank
      )
    `)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const redacted = (runs ?? []).map((r) => ({
    ...r,
    overall_score: redact ? 0 : r.overall_score,
    visibility_scores: (r.visibility_scores ?? []).map((s: Record<string, unknown>) => ({
      ...s,
      score: redact ? 0 : s.score,
      mention_count: redact ? 0 : s.mention_count,
      avg_rank: redact ? null : s.avg_rank,
    })),
  }));

  return NextResponse.json({ runs: redacted });
}
