import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { deliverReport } from "@/lib/report-delivery";

export const maxDuration = 60;

// "Send this report now": to one destination (a test) or to every active destination.
// Scheduled sending happens on its own (inngest/functions/reports.ts).
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, period, offset, destinationId } = await req.json().catch(() => ({}));
  if (!brandId || (period !== "weekly" && period !== "monthly")) return NextResponse.json({ error: "brandId and period are required" }, { status: 400 });
  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id, name, domain");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  if (await requiresPaywall(admin, access.ownerId)) return NextResponse.json({ error: "Sending reports is part of the paid plan.", reason: "upgrade" }, { status: 402 });
  if (!(await checkRateLimit("report-send", brandId, 20, 60 * 60))) return NextResponse.json({ error: "Too many reports sent in the last hour. Try again a little later." }, { status: 429 });

  const brand = access.brand as unknown as { id: string; name: string; domain: string };
  const { results } = await deliverReport(admin, { ...brand, ownerId: access.ownerId }, period, {
    onlyOptedIn: false,
    destinationIds: typeof destinationId === "string" ? [destinationId] : undefined,
    offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
    manual: true,
  });
  if (!results.length) return NextResponse.json({ error: "Add an active destination first (email, Slack, Discord or a webhook)." }, { status: 400 });
  return NextResponse.json({ results });
}
