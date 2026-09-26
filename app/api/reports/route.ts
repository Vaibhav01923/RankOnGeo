import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { collectReport } from "@/lib/report-data";

export const maxDuration = 60;

// The report shown in the Reports tab: what RankOnGeo did for the brand in a week or a
// month, and the results. offset 0 is the period so far, -1 the last finished one, and so on.
export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  const period = req.nextUrl.searchParams.get("period");
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  if (period !== "weekly" && period !== "monthly") return NextResponse.json({ error: "period must be weekly or monthly" }, { status: 400 });
  if (!Number.isFinite(offset)) return NextResponse.json({ error: "offset must be a number" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id, name, domain");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const brand = access.brand as unknown as { id: string; name: string; domain: string };

  try {
    const report = await collectReport(serverClient(), { ...brand, ownerId: access.ownerId }, period, offset);
    return NextResponse.json({ report });
  } catch (e) {
    console.error("[reports] build failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't build this report right now. Please try again." }, { status: 500 });
  }
}
