import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, name, niche, competitors, targetAudience, prompts } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error: brandErr } = await db
    .from("brands")
    .update({ name, niche, competitors, target_audience: targetAudience })
    .eq("id", id)
    .eq("user_id", user.id);

  if (brandErr) return NextResponse.json({ error: brandErr.message }, { status: 500 });

  if (Array.isArray(prompts)) {
    await db.from("tracked_prompts").delete().eq("brand_id", id);
    if (prompts.length > 0) {
      await db.from("tracked_prompts").insert(
        prompts.map((p: { text: string; category: string }) => ({ brand_id: id, text: p.text, category: p.category }))
      );
    }
  }

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("id");
  if (!brandId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = clientFromRequest(req);

  const { data: { user } } = await db.auth.getUser();

  const { data: brand, error } = await db
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("user_id", user?.id)
    .single();

  if (error || !brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: prompts } = await db
    .from("tracked_prompts")
    .select("id, text, category, status, cadence")
    .eq("brand_id", brandId);

  return NextResponse.json({
    id: brand.id,
    domain: brand.domain,
    name: brand.name,
    niche: brand.niche,
    description: brand.description,
    targetAudience: brand.target_audience,
    competitors: brand.competitors,
    trackedPrompts: (prompts ?? []).map((p) => ({ id: p.id, text: p.text, category: p.category, status: p.status, cadence: p.cadence })),
  });
}
