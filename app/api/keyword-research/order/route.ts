import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";
import { normalizeKeyword } from "@/lib/keyword-list";

// Saves the customer's chosen order for Autopilot's writing queue. `keywords` is
// the queued keywords, first-to-be-written first. Listed keywords get positions
// 1..n; any queued keyword not listed loses its position and falls back to the
// normal order, so a stale list can never strand a topic.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, keywords } = await req.json().catch(() => ({}));
  if (!brandId || !Array.isArray(keywords) || keywords.length > 500 || keywords.some((k: unknown) => typeof k !== "string")) {
    return NextResponse.json({ error: "brandId and a list of keywords are required" }, { status: 400 });
  }
  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  if (await requiresPaywall(admin, access.ownerId)) return NextResponse.json({ error: "Auto-publishing is part of the paid plan.", reason: "upgrade" }, { status: 402 });

  const { data: queued, error } = await admin.from("autopilot_topics").select("id, keyword, position").eq("brand_id", brandId).eq("status", "queued");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const wanted = new Map<string, number>();
  (keywords as string[]).forEach((k, i) => { const key = normalizeKeyword(k); if (key && !wanted.has(key)) wanted.set(key, wanted.size + 1); });

  // Only touch rows whose position actually changes.
  const changes = (queued ?? [])
    .map((t) => ({ id: t.id as string, position: wanted.get(normalizeKeyword(t.keyword)) ?? null, current: (t.position as number | null) ?? null }))
    .filter((t) => t.position !== t.current);
  const results = await Promise.all(changes.map((t) => admin.from("autopilot_topics").update({ position: t.position }).eq("id", t.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated: changes.length });
}
