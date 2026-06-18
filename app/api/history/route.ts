import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const db = clientFromRequest(req);

  const { data: { user } } = await db.auth.getUser();

  // Verify the brand belongs to the requesting user before returning history
  const { data: brand } = await db
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", user?.id)
    .single();

  if (!brand) return NextResponse.json({ runs: [] });

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

  return NextResponse.json({ runs: runs ?? [] });
}
