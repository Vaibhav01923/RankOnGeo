import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { assertUnderPromptLimit } from "@/lib/plan-limits";

export async function POST(req: NextRequest) {
  const { brandId, text, category } = await req.json();
  if (!brandId || !text?.trim()) return NextResponse.json({ error: "brandId and text required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: brand } = await db.from("brands").select("id").eq("id", brandId).eq("user_id", user.id).single();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const limitCheck = await assertUnderPromptLimit(db, user.id, brandId);
  if (!limitCheck.ok) {
    return NextResponse.json({ error: `Your plan tracks up to ${limitCheck.limit} active prompts. Upgrade to track more.` }, { status: 402 });
  }

  const { data: prompt, error } = await db
    .from("tracked_prompts")
    .insert({ brand_id: brandId, text: text.trim(), category: category ?? "Commercial" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prompt: { id: prompt.id, text: prompt.text, category: prompt.category } });
}

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: brand } = await db.from("brands").select("id").eq("id", brandId).eq("user_id", user.id).single();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { error } = await db.from("tracked_prompts").delete().eq("brand_id", brandId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
