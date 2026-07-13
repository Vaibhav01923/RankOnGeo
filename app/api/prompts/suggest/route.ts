import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { generatePromptSuggestions } from "@/lib/prompt-suggestions";
import { requireBrandAccess } from "@/lib/team";

const SUGGEST_COUNT = 10;

async function loadBrandAndOwner(db: ReturnType<typeof clientFromRequest>, brandId: string) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;

  const access = await requireBrandAccess(db, user.id, brandId, "name, domain, niche, description, competitors");
  if (!access) return { error: NextResponse.json({ error: "Brand not found" }, { status: 404 }) } as const;

  return { brand: access.brand as unknown as { name: string; domain: string; niche: string; description: string; competitors: string[] } } as const;
}

// Persisted suggestions are shown as-is — no LLM call on every tab visit.
// Only generates fresh ones the very first time a brand has none yet.
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const result = await loadBrandAndOwner(db, brandId);
  if ("error" in result) return result.error;

  const { data: existing } = await db
    .from("prompt_suggestions")
    .select("id, text, category")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  if (existing?.length) return NextResponse.json({ suggestions: existing });

  // First-ever visit for this brand — generate an initial batch and persist it.
  const { data: tracked } = await db.from("tracked_prompts").select("text").eq("brand_id", brandId);
  const drafts = await generatePromptSuggestions({
    brandName: result.brand.name,
    domain: result.brand.domain,
    niche: result.brand.niche,
    description: result.brand.description,
    competitors: (result.brand.competitors ?? []).join(", "),
    excludeTexts: (tracked ?? []).map((p) => p.text),
    count: SUGGEST_COUNT,
  });

  if (!drafts.length) return NextResponse.json({ suggestions: [] });

  const { data: saved } = await db
    .from("prompt_suggestions")
    .insert(drafts.map((d) => ({ brand_id: brandId, text: d.text, category: d.category })))
    .select("id, text, category");

  return NextResponse.json({ suggestions: saved ?? [] });
}

// Explicit "Suggest new ones" — wipes the persisted batch and generates a
// completely fresh set, unlike GET which only ever generates once.
export async function POST(req: NextRequest) {
  const { brandId } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const result = await loadBrandAndOwner(db, brandId);
  if ("error" in result) return result.error;

  const { data: tracked } = await db.from("tracked_prompts").select("text").eq("brand_id", brandId);
  const drafts = await generatePromptSuggestions({
    brandName: result.brand.name,
    domain: result.brand.domain,
    niche: result.brand.niche,
    description: result.brand.description,
    competitors: (result.brand.competitors ?? []).join(", "),
    excludeTexts: (tracked ?? []).map((p) => p.text),
    count: SUGGEST_COUNT,
  });

  await db.from("prompt_suggestions").delete().eq("brand_id", brandId);
  if (!drafts.length) return NextResponse.json({ suggestions: [] });

  const { data: saved } = await db
    .from("prompt_suggestions")
    .insert(drafts.map((d) => ({ brand_id: brandId, text: d.text, category: d.category })))
    .select("id, text, category");

  return NextResponse.json({ suggestions: saved ?? [] });
}
