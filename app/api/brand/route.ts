import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("id");
  if (!brandId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = clientFromRequest(req);

  const { data: brand, error } = await db
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .single();

  if (error || !brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: prompts } = await db
    .from("tracked_prompts")
    .select("id, text, category")
    .eq("brand_id", brandId);

  return NextResponse.json({
    id: brand.id,
    domain: brand.domain,
    name: brand.name,
    niche: brand.niche,
    description: brand.description,
    targetAudience: brand.target_audience,
    competitors: brand.competitors,
    trackedPrompts: (prompts ?? []).map((p) => ({ id: p.id, text: p.text, category: p.category })),
  });
}
