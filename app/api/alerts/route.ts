import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

// Authorize destination mutations through the destination's brand so
// teammates can manage alerts whoever created them.
async function requireDestinationAccess(db: ReturnType<typeof clientFromRequest>, userId: string, destinationId: string) {
  const { data: dest } = await db.from("alert_destinations").select("id, brand_id").eq("id", destinationId).maybeSingle();
  if (!dest) return null;
  return requireBrandAccess(db, userId, dest.brand_id);
}

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const [destRes, delivRes] = await Promise.all([
    db.from("alert_destinations").select("*").eq("brand_id", brandId).order("created_at", { ascending: true }),
    db.from("alert_deliveries")
      .select("*, alert_destinations(name, kind)")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    destinations: destRes.data ?? [],
    deliveries: delivRes.data ?? [],
  });
}

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { brandId, name, kind, url, email } = await req.json();
  if (!brandId || !name || !kind) {
    return NextResponse.json({ error: "brandId, name, kind required" }, { status: 400 });
  }

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error } = await db
    .from("alert_destinations")
    .insert({ brand_id: brandId, user_id: user.id, name, kind, url: url ?? null, email: email ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ destination: data });
}

export async function PUT(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, status, name, url, email } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const access = await requireDestinationAccess(db, user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (name !== undefined) updates.name = name;
  if (url !== undefined) updates.url = url;
  if (email !== undefined) updates.email = email;

  const { data, error } = await db
    .from("alert_destinations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ destination: data });
}

export async function DELETE(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const access = await requireDestinationAccess(db, user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await db
    .from("alert_destinations")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
