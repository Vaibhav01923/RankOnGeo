import type { SupabaseClient } from "@supabase/supabase-js";

// Web/LLM Analytics ingestion is a paid-plan perk. A free-tier brand's
// site_key resolves to nothing here — same response either way (no info
// leak about whether the key is invalid vs. just unpaid).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findPaidBrandBySiteKey(db: SupabaseClient<any, any, any>, siteKey: string): Promise<{ id: string } | null> {
  const { data: brand } = await db.from("brands").select("id, user_id").eq("site_key", siteKey).maybeSingle();
  if (!brand) return null;

  const { data: plan } = await db.from("user_plans").select("dodo_subscription_id").eq("user_id", brand.user_id).maybeSingle();
  if (!plan?.dodo_subscription_id) return null;

  return { id: brand.id };
}
