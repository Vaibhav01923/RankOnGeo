import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { generatePromptSuggestions } from "@/lib/prompt-suggestions";
import { assertUnderPromptLimit } from "@/lib/plan-limits";
import { requireBrandAccess } from "@/lib/team";

// Moves one suggestion into tracked_prompts, then backfills the pool with a
// single fresh replacement — so the suggestion list stays at a steady size
// instead of shrinking every time the user adds one.
export async function POST(req: NextRequest) {
  const { brandId, suggestionId, text, category } = await req.json();
  if (!brandId || !suggestionId || !text?.trim()) {
    return NextResponse.json({ error: "brandId, suggestionId, and text required" }, { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId, "name, domain, niche, description, competitors");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const brand = access.brand as unknown as { name: string; domain: string; niche: string; description: string; competitors: string[] };

  const limitCheck = await assertUnderPromptLimit(db, access.ownerId, brandId);
  if (!limitCheck.ok) {
    return NextResponse.json({ error: `Your plan tracks up to ${limitCheck.limit} active prompts. Upgrade to track more.` }, { status: 402 });
  }

  const { data: prompt, error } = await db
    .from("tracked_prompts")
    .insert({ brand_id: brandId, text: text.trim(), category: category ?? "Commercial" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("prompt_suggestions").delete().eq("id", suggestionId);

  const [{ data: tracked }, { data: remaining }] = await Promise.all([
    db.from("tracked_prompts").select("text").eq("brand_id", brandId),
    db.from("prompt_suggestions").select("text").eq("brand_id", brandId),
  ]);

  const drafts = await generatePromptSuggestions({
    brandName: brand.name,
    domain: brand.domain,
    niche: brand.niche,
    description: brand.description,
    competitors: (brand.competitors ?? []).join(", "),
    excludeTexts: [...(tracked ?? []).map((p) => p.text), ...(remaining ?? []).map((p) => p.text)],
    count: 1,
  });

  let replacement = null;
  if (drafts.length) {
    const { data: saved } = await db
      .from("prompt_suggestions")
      .insert({ brand_id: brandId, text: drafts[0].text, category: drafts[0].category })
      .select("id, text, category")
      .single();
    replacement = saved ?? null;
  }

  return NextResponse.json({
    prompt: { id: prompt.id, text: prompt.text, category: prompt.category },
    replacement,
  });
}
