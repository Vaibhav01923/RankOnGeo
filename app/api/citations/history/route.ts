import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // The dashboard shows this whole chart as a locked skeleton (not even
  // blurred) for free tier, so the API must not hand out the real series.
  if (await requiresPaywall(db, access.ownerId)) return NextResponse.json({ series: [] });

  // Fetch last 7 scan runs
  const { data: runs } = await db
    .from("scan_runs")
    .select("id, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(7);

  if (!runs?.length) return NextResponse.json({ series: [] });

  // Fetch brand domain to exclude self-citations
  const { data: brandRow } = await db.from("brands").select("domain").eq("id", brandId).single();
  const brandHost = (brandRow?.domain ?? "").replace(/^www\./, "");

  // For each run, fetch citations from scan_results
  const runData = await Promise.all(
    runs.map(async (run) => {
      const { data: rows } = await db
        .from("scan_results")
        .select("citations")
        .eq("scan_run_id", run.id);

      // Count each domain max once per scan_result row; exclude brand's own domain
      const domainCounts: Record<string, number> = {};
      (rows ?? []).forEach((r) => {
        const seenInRow = new Set<string>();
        (r.citations ?? []).forEach((url: string) => {
          try {
            const domain = new URL(url).hostname.replace(/^www\./, "");
            if (!domain) return;
            if (brandHost && (domain === brandHost || domain.endsWith("." + brandHost))) return;
            if (seenInRow.has(domain)) return;
            seenInRow.add(domain);
            domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
          } catch {}
        });
      });

      return {
        date: run.created_at.slice(0, 10),
        domainCounts,
      };
    })
  );

  // Determine top 5 domains across all runs
  const totalCounts: Record<string, number> = {};
  runData.forEach(({ domainCounts }) => {
    Object.entries(domainCounts).forEach(([d, c]) => {
      totalCounts[d] = (totalCounts[d] ?? 0) + c;
    });
  });
  const top5 = Object.entries(totalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d);

  // Build series: one entry per domain, ordered by date ascending
  const datesAsc = [...runData].reverse();
  const series = top5.map((domain) => ({
    domain,
    data: datesAsc.map(({ date, domainCounts }) => ({
      date,
      count: domainCounts[domain] ?? 0,
    })),
  }));

  return NextResponse.json({ series });
}
