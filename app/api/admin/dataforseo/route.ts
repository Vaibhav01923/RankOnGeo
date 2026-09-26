import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { summarizeSpend } from "@/lib/dataforseo-spend-summary";

const WINDOW_DAYS = 30;

// The account's own numbers straight from DataForSEO (a free call): what's left,
// what has ever been deposited, and what it says was spent today (UTC). Today's
// figure includes calls made before per-call tracking existed, so the page shows
// it next to the itemised total rather than pretending they are the same.
async function accountSnapshot(): Promise<{ balance: number; deposited: number; spentToday: number } | null> {
  const auth = "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN ?? ""}:${process.env.DATAFORSEO_PASSWORD ?? ""}`).toString("base64");
  try {
    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", { headers: { Authorization: auth }, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const money = json?.tasks?.[0]?.result?.[0]?.money;
    if (typeof money?.balance !== "number") return null;
    return { balance: money.balance, deposited: Number(money.total) || 0, spentToday: Number(money.statistics?.day?.total) || 0 };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const db = serverClient();
  const [{ data: rows, error }, { data: first }, account] = await Promise.all([
    db.from("dataforseo_spend").select("created_at, source, cost").gte("created_at", since).order("created_at", { ascending: true }).limit(50000),
    db.from("dataforseo_spend").select("created_at").order("created_at", { ascending: true }).limit(1),
    accountSnapshot(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = summarizeSpend(rows ?? [], WINDOW_DAYS);
  // Days of balance left at the recent burn rate. Needs a few days of tracking
  // and some spend to mean anything, otherwise it would be a wild guess.
  const runwayDays = account && summary.avgDays >= 3 && summary.avgDaily7d > 0 ? Math.floor(account.balance / summary.avgDaily7d) : null;

  return NextResponse.json({
    ...summary,
    trackedSince: first?.[0]?.created_at ?? null,
    account,
    runwayDays,
    dailyKeywordCap: Number(process.env.KEYWORD_LOOKUPS_PER_DAY) || 30,
    dataForSeoEnabled: process.env.DATAFORSEO_ENABLED === "true",
  });
}
