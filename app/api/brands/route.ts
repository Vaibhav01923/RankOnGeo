import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { getAccessibleOwnerIds } from "@/lib/team";

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ownerIds = await getAccessibleOwnerIds(db, user.id);

  const { data: brands, error } = await db
    .from("brands")
    .select("id, name, domain, user_id")
    .in("user_id", ownerIds)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Own brands first, then workspaces shared with the user.
  const annotated = (brands ?? [])
    .map((b) => ({
      id: b.id,
      name: b.name,
      domain: b.domain,
      role: b.user_id === user.id ? ("owner" as const) : ("member" as const),
    }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));

  return NextResponse.json({ brands: annotated });
}
