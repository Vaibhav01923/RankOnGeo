import { aiEngineForVisit, referrerHost } from "@/lib/ai-referrers";

// How much traffic each article RankOnGeo published is getting, from the site's
// own analytics. Visits are matched to articles by page path, so an article
// needs its live URL on record; without it there is nothing to count.

export type PerfArticle = {
  id: string;
  title: string;
  keyword: string | null;
  published_url: string | null;
  published_at: string | null;
  source: string | null;
};

export type PerfVisit = { path: string; visitor_id: string; referrer: string | null; utm_source: string | null; created_at: string };

export type ArticlePerf = {
  id: string;
  title: string;
  keyword: string | null;
  url: string | null;
  publishedAt: string | null;
  source: string | null;
  views: number;
  visitors: number;
  aiVisits: number;
  aiEngines: { label: string; count: number }[];
  lastVisitAt: string | null;
};

// "/blog/post/" and "/blog/post" are the same page. Returns null for anything
// that isn't a usable URL.
export function pathOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const p = new URL(url).pathname;
    return p.length > 1 ? p.replace(/\/+$/, "") : p;
  } catch {
    return null;
  }
}

export function pathVariants(path: string): string[] {
  return path === "/" ? ["/"] : [path, `${path}/`];
}

export function summarizeArticlePerformance(articles: PerfArticle[], visits: PerfVisit[]): { articles: ArticlePerf[]; totals: { views: number; visitors: number; aiVisits: number; tracked: number } } {
  const byPath = new Map<string, PerfVisit[]>();
  for (const v of visits) {
    const p = v.path.length > 1 ? v.path.replace(/\/+$/, "") : v.path;
    const list = byPath.get(p);
    if (list) list.push(v);
    else byPath.set(p, [v]);
  }

  const allVisitors = new Set<string>();
  const perf: ArticlePerf[] = articles.map((a) => {
    const path = pathOf(a.published_url);
    const own = path ? byPath.get(path) ?? [] : [];
    const engines = new Map<string, number>();
    let last: string | null = null;
    for (const v of own) {
      allVisitors.add(v.visitor_id);
      const engine = aiEngineForVisit(referrerHost(v.referrer), v.utm_source);
      if (engine) engines.set(engine, (engines.get(engine) ?? 0) + 1);
      if (!last || v.created_at > last) last = v.created_at;
    }
    return {
      id: a.id,
      title: a.title,
      keyword: a.keyword,
      url: a.published_url,
      publishedAt: a.published_at,
      source: a.source,
      views: own.length,
      visitors: new Set(own.map((v) => v.visitor_id)).size,
      aiVisits: [...engines.values()].reduce((s, n) => s + n, 0),
      aiEngines: [...engines.entries()].map(([label, count]) => ({ label, count })).sort((x, y) => y.count - x.count),
      lastVisitAt: last,
    };
  });

  perf.sort((a, b) => b.views - a.views || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return {
    articles: perf,
    totals: {
      views: perf.reduce((s, a) => s + a.views, 0),
      visitors: allVisitors.size,
      aiVisits: perf.reduce((s, a) => s + a.aiVisits, 0),
      tracked: perf.filter((a) => a.url && pathOf(a.url)).length,
    },
  };
}
