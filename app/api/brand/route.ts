import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { applyBrandEdits } from "@/lib/brand-save";

export async function PUT(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, name, niche, competitors, targetAudience, prompts } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, id);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { error } = await applyBrandEdits(db, id, { name, niche, competitors, targetAudience, prompts });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Every table with a brand_id FK cascades on delete (tracked_prompts,
  // scan_results, articles, web_visits/bot_visits, etc.) — this one delete
  // removes all of a brand's history in one shot. Scoped to user_id so a
  // brand id from another account can never be deleted via this route.
  const { error, count } = await db.from("brands").delete({ count: "exact" }).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("id");
  if (!brandId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = clientFromRequest(req);

  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId, "*");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const brand = access.brand as Record<string, string>;

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
    role: access.role,
    ownerId: access.ownerId,
    trackedPrompts: (prompts ?? []).map((p) => ({ id: p.id, text: p.text, category: p.category, status: p.status, cadence: p.cadence })),
  });
}
