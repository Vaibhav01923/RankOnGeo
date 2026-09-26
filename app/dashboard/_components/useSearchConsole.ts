"use client";

import { useCallback, useEffect, useState } from "react";

export type GscRow = { label: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscSite = { siteUrl: string; permissionLevel: string };
export type GscData = {
  configured: boolean;
  connected: boolean;
  reconnect?: boolean;
  error?: string;
  siteListError?: "api_disabled" | "forbidden" | "error";
  email?: string | null;
  siteUrl?: string | null;
  sites?: GscSite[];
  range?: { start: string; end: string };
  totals?: { clicks: number; impressions: number; ctr: number; position: number };
  series?: { label: string; count: number }[];
  queries?: GscRow[];
  pages?: GscRow[];
};

// Google reports Search data about two days behind, so every Google-sourced
// number in the dashboard carries this note.
export const GOOGLE_DELAY_NOTE = "2-day delay";

// Loads Search Console data for the Analytics page. The numbers are merged into
// the traffic charts and tables rather than shown as a separate section, so
// the data lives up here and each widget just reads what it needs.
export function useSearchConsole(brandId: string | undefined, days: number, enabled: boolean) {
  const [data, setData] = useState<GscData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // A different brand has a different connection.
  useEffect(() => { setData(null); }, [brandId]);

  useEffect(() => {
    if (!enabled || !brandId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/gsc/data?brandId=${brandId}&days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d.error && !("configured" in d) ? { configured: true, connected: false, error: d.error } : d); })
      .catch(() => { if (!cancelled) setData({ configured: true, connected: false, error: "Couldn't load Search Console data." }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId, days, enabled, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const saveSite = useCallback(async (siteUrl: string) => {
    if (!siteUrl || busy || !brandId) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch("/api/gsc/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, siteUrl }) });
      if (!res.ok) setActionError((await res.json().catch(() => ({}))).error ?? "Couldn't save that property");
      else reload();
    } finally {
      setBusy(false);
    }
  }, [brandId, busy, reload]);

  const disconnect = useCallback(async () => {
    if (busy || !brandId || !confirm("Disconnect Google Search Console? Google numbers will stop appearing in your analytics.")) return;
    setBusy(true);
    try {
      await fetch("/api/gsc/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId }) });
      reload();
    } finally {
      setBusy(false);
    }
  }, [brandId, busy, reload]);

  return { data, loading, busy, actionError, reload, saveSite, disconnect };
}

export type SearchConsole = ReturnType<typeof useSearchConsole>;
