import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

// Authorize channel mutations through the channel's brand so teammates can
// manage publishing channels whoever created them.
async function requireChannelAccess(db: ReturnType<typeof clientFromRequest>, userId: string, channelId: string) {
  const { data: channel } = await db.from("publishing_channels").select("id, brand_id").eq("id", channelId).maybeSingle();
  if (!channel) return null;
  return requireBrandAccess(db, userId, channel.brand_id);
}

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error } = await db
    .from("publishing_channels")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channels: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { brandId, name, type, url, apiKey } = await req.json();
  if (!brandId || !name || !type || !url) {
    return NextResponse.json({ error: "brandId, name, type, url required" }, { status: 400 });
  }

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error } = await db
    .from("publishing_channels")
    .insert({ brand_id: brandId, user_id: user.id, name, type, url, api_key: apiKey ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channel: data });
}

export async function PUT(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, status, name, url, apiKey } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const access = await requireChannelAccess(db, user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (name !== undefined) updates.name = name;
  if (url !== undefined) updates.url = url;
  if (apiKey !== undefined) updates.api_key = apiKey;

  const { data, error } = await db
    .from("publishing_channels")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channel: data });
}

export async function DELETE(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const access = await requireChannelAccess(db, user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await db
    .from("publishing_channels")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
