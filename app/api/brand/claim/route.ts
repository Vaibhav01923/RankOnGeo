import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { applyBrandEdits, BrandEdits } from "@/lib/brand-save";

// Attaches an anonymously-created brand (from /api/setup, before the visitor
// had an account) to whichever account confirms email next. Mirrors
// app/api/team/accept/route.ts's token-resolved, service-role claim shape —
// the pending_brand_claim cookie (set by /api/setup) is the sole trust
// boundary, since there's no invited-email signal to cross-check like team
// invites have. Safe to call speculatively with no cookie present (no-op).
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = req.cookies.get("pending_brand_claim")?.value;
  if (!token) return NextResponse.json({ claimed: false });

  const admin = serverClient();
  const clearCookie = (res: NextResponse) => {
    res.cookies.set("pending_brand_claim", "", { path: "/", maxAge: 0 });
    return res;
  };

  const { data: brand } = await admin
    .from("brands")
    .select("id, domain")
    .eq("claim_token", token)
    .is("user_id", null)
    .maybeSingle();

  if (!brand) return clearCookie(NextResponse.json({ claimed: false }));

  const body = await req.json().catch(() => ({}));
  const edits = body?.edits as Partial<BrandEdits> | undefined;
  if (edits && typeof edits.name === "string") {
    await applyBrandEdits(admin, brand.id, {
      name: edits.name,
      niche: edits.niche ?? "",
      competitors: edits.competitors ?? [],
      targetAudience: edits.targetAudience ?? [],
      prompts: edits.prompts,
    });
  }

  const { error } = await admin
    .from("brands")
    .update({ user_id: user.id, claim_token: null })
    .eq("id", brand.id)
    .is("user_id", null);

  if (error) {
    // 23505 = unique (domain,user_id) violation — this visitor already
    // tracks that domain under their real account. Discard the anonymous
    // draft and point the caller at the brand they already have instead.
    if (error.code === "23505") {
      await admin.from("brands").delete().eq("id", brand.id);
      const { data: real } = await admin
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .eq("domain", brand.domain)
        .maybeSingle();
      return clearCookie(NextResponse.json({ claimed: false, existingBrandId: real?.id ?? null }));
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return clearCookie(NextResponse.json({ claimed: true, brandId: brand.id }));
}
