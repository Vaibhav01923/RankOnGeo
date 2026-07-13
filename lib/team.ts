// Team mode: a workspace owner invites members by email; membership grants
// full access to every brand the owner has. Routes call requireBrandAccess
// instead of checking brands.user_id themselves, and paid actions bill
// access.ownerId. RLS enforces the same rule at the DB level via the member
// policies in supabase/migrations/20260713130000_team_mode_rls.sql — both
// layers must agree, since every route queries through the user's own JWT.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const TEAM_SEAT_LIMIT = 15;

export type BrandAccess = {
  brand: Record<string, unknown> & { id: string; user_id: string };
  // Whose plan/credits paid actions bill against — always the brand owner.
  ownerId: string;
  role: "owner" | "member";
};

// Owner ids whose workspaces this user can see: self, plus owners who invited
// them and still have an active paid subscription. Access gates on the
// owner's dodo_subscription_id at request time — a downgrade cuts member
// access immediately, re-subscribing restores it; membership rows are never
// deleted for billing reasons.
export async function getAccessibleOwnerIds(db: Db, userId: string): Promise<string[]> {
  const { data: memberships } = await db
    .from("team_members")
    .select("owner_user_id")
    .eq("member_user_id", userId);

  const ownerIds = (memberships ?? []).map((m: { owner_user_id: string }) => m.owner_user_id);
  if (ownerIds.length === 0) return [userId];

  const { data: paidOwners } = await db
    .from("user_plans")
    .select("user_id")
    .in("user_id", ownerIds)
    .not("dodo_subscription_id", "is", null);

  return [userId, ...(paidOwners ?? []).map((p: { user_id: string }) => p.user_id)];
}

// Replaces the `.eq("user_id", user.id)` brand ownership checks. Returns null
// (caller responds 404) when the brand doesn't exist, the user is neither
// owner nor member, or the owning workspace is no longer paid. The owner path
// is a single query — same cost as the check it replaces.
export async function requireBrandAccess(
  db: Db,
  userId: string,
  brandId: string,
  select = "id, user_id"
): Promise<BrandAccess | null> {
  if (!brandId) return null;
  const columns =
    select === "*" || select.includes("user_id") ? select : `${select}, user_id`;

  const { data: brand } = await db.from("brands").select(columns).eq("id", brandId).maybeSingle();
  if (!brand) return null;

  if (brand.user_id === userId) {
    return { brand, ownerId: userId, role: "owner" };
  }

  const { data: membership } = await db
    .from("team_members")
    .select("id")
    .eq("owner_user_id", brand.user_id)
    .eq("member_user_id", userId)
    .maybeSingle();
  if (!membership) return null;

  const { data: ownerPlan } = await db
    .from("user_plans")
    .select("dodo_subscription_id")
    .eq("user_id", brand.user_id)
    .maybeSingle();
  if (!ownerPlan?.dodo_subscription_id) return null;

  return { brand, ownerId: brand.user_id, role: "member" };
}
