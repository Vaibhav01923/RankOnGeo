import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { isEmail, isSafeWebhookUrl, webhookUrlProblem } from "@/lib/webhook-url";

const KINDS = ["slack", "discord", "webhook", "email"];
const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

// What a destination points at has to be valid for its kind (see lib/webhook-url.ts).
function targetProblem(kind: string, url: string | null | undefined, email: string | null | undefined): string | null {
  if (kind === "email") return isEmail(email) ? null : "Enter a valid email address.";
  return isSafeWebhookUrl(kind, url) ? null : webhookUrlProblem(kind);
}

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

  const { brandId, name, kind, url, email, scan_alerts, weekly_report, monthly_report } = await req.json();
  if (!brandId || !name || !kind) {
    return NextResponse.json({ error: "brandId, name, kind required" }, { status: 400 });
  }
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "kind must be slack, discord, webhook or email" }, { status: 400 });
  const problem = targetProblem(kind, url, email);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error } = await db
    .from("alert_destinations")
    .insert({
      brand_id: brandId, user_id: user.id, name, kind, url: url ?? null, email: email ?? null,
      // A new destination gets the reports by default; instant scan alerts stay on as before.
      scan_alerts: flag(scan_alerts, true), weekly_report: flag(weekly_report, true), monthly_report: flag(monthly_report, true),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ destination: data });
}

export async function PUT(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, status, name, url, email, scan_alerts, weekly_report, monthly_report } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const access = await requireDestinationAccess(db, user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (name !== undefined) updates.name = name;
  if (url !== undefined || email !== undefined) {
    const { data: current } = await db.from("alert_destinations").select("kind, url, email").eq("id", id).maybeSingle();
    const problem = current ? targetProblem(current.kind, url !== undefined ? url : current.url, email !== undefined ? email : current.email) : null;
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  if (url !== undefined) updates.url = url;
  if (email !== undefined) updates.email = email;
  for (const [key, value] of Object.entries({ scan_alerts, weekly_report, monthly_report })) {
    if (typeof value === "boolean") updates[key] = value;
  }

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
