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

  // Reconcile rather than blindly delete-and-replace: prompts the user is
  // keeping must keep their real row (and its scan history/cadence state)
  // instead of being recreated with a new id — otherwise confirming this
  // screen for an already-tracked brand would silently orphan everything.
  if (Array.isArray(prompts)) {
    const incoming = prompts as { id?: string; text: string; category: string }[];
    const { data: existingRows } = await db.from("tracked_prompts").select("id").eq("brand_id", id);
    const existingIds = new Set((existingRows ?? []).map((r) => r.id as string));

    const keptIds = new Set(incoming.map((p) => p.id).filter((pid): pid is string => !!pid && existingIds.has(pid)));
    const toRemove = [...existingIds].filter((eid) => !keptIds.has(eid));
    if (toRemove.length > 0) {
      await db.from("tracked_prompts").delete().in("id", toRemove);
    }

    const toInsert = incoming.filter((p) => !p.id || !existingIds.has(p.id));
    if (toInsert.length > 0) {
      await db.from("tracked_prompts").insert(
        toInsert.map((p) => ({ brand_id: id, text: p.text, category: p.category }))
      );
    }
  }

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
