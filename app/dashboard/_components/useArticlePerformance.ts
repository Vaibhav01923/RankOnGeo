"use client";

import { useCallback, useEffect, useState } from "react";

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

export type ArticlePerformance = {
  days: number;
  trackingConnected: boolean;
  articles: ArticlePerf[];
  totals: { views: number; visitors: number; aiVisits: number; tracked: number; articles: number };
};

// Views and visits for the articles published to the customer's site. Shared by
// the Articles tab and the Analytics page, which both show it.
export function useArticlePerformance(brandId: string | undefined, days: number, enabled: boolean) {
  const [data, setData] = useState<ArticlePerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { setData(null); }, [brandId]);

  useEffect(() => {
    if (!enabled || !brandId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/articles/performance?brandId=${brandId}&days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.articles) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId, days, enabled, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, loading, reload };
}
