import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { pathOf, pathVariants, summarizeArticlePerformance } from "@/lib/article-performance";

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_DAYS = [7, 30, 90];

// Views, visitors and visits from AI answers for every article published to the
// customer's site, from the site's own analytics. Powers the Articles tab and the
// "traffic from RankOnGeo articles" highlight on the Analytics page.
export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  const { data: articles } = await admin
    .from("articles")
    .select("id, title, keyword, published_url, published_at, source")
    .eq("brand_id", brandId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  const published = articles ?? [];

  const paths = [...new Set(published.map((a) => pathOf(a.published_url)).filter((p): p is string => !!p))];
  let visits: { path: string; visitor_id: string; referrer: string | null; utm_source: string | null; created_at: string }[] = [];
  if (paths.length) {
    const since = new Date(Date.now() - days * DAY_MS).toISOString();
    const { data } = await admin
      .from("web_visits")
      .select("path, visitor_id, referrer, utm_source, created_at")
      .eq("brand_id", brandId)
      .in("path", paths.flatMap(pathVariants))
      .gte("created_at", since)
      .not("visitor_id", "like", "test-%")
      .limit(50000);
    visits = data ?? [];
  }

  // Are we receiving any real visits at all? If not, zeros mean "tracking isn't
  // installed", not "nobody read your articles".
  const { data: anyVisit } = await admin.from("web_visits").select("id").eq("brand_id", brandId).not("visitor_id", "like", "test-%").limit(1).maybeSingle();

  const summary = summarizeArticlePerformance(published, visits);
  return NextResponse.json({
    days,
    trackingConnected: !!anyVisit,
    articles: summary.articles,
    totals: { ...summary.totals, articles: published.length },
  });
}
