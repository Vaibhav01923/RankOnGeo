import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";
import { brandsDueForReports, deliverReport } from "@/lib/report-delivery";
import type { ReportPeriod } from "@/lib/report";

// Weekly reports go out Monday 09:00 UTC (covering the week that just ended, Monday to
// Sunday); monthly reports on the 1st at 09:00 UTC (covering the month that just ended).
// Each firing fans out one job per brand that has a destination wanting it.
async function fanOut(period: ReportPeriod, step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T>; sendEvent: (id: string, events: { name: string; data: Record<string, unknown> }[]) => Promise<unknown> }) {
  const brandIds = await step.run("fetch-brands", () => brandsDueForReports(serverClient(), period));
  if (!brandIds.length) return { queued: 0 };
  await step.sendEvent("fan-out", brandIds.map((brandId) => ({ name: "report/brand.requested", data: { brandId, period } })));
  return { queued: brandIds.length };
}

export const scheduledWeeklyReports = inngest.createFunction(
  { id: "reports-weekly", triggers: [{ cron: "0 9 * * 1" }] },
  async ({ step }) => fanOut("weekly", step as never),
);

export const scheduledMonthlyReports = inngest.createFunction(
  { id: "reports-monthly", triggers: [{ cron: "0 9 1 * *" }] },
  async ({ step }) => fanOut("monthly", step as never),
);

// One brand, one report. Sending to a destination that already got this period's
// report is skipped (see deliverReport), so a retry or a double firing is harmless.
export const sendBrandReport = inngest.createFunction(
  { id: "report-brand", retries: 1, concurrency: { limit: 4 }, triggers: [{ event: "report/brand.requested" }] },
  async ({ event, step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { brandId, period } = (event as any).data as { brandId: string; period: ReportPeriod };
    if (period !== "weekly" && period !== "monthly") return { skipped: "bad period" };
    return step.run("send", async () => {
      const db = serverClient();
      const { data: brand } = await db.from("brands").select("id, name, domain, user_id").eq("id", brandId).maybeSingle();
      if (!brand?.user_id) return { skipped: "brand not found" };
      const { results } = await deliverReport(db, { id: brand.id, name: brand.name, domain: brand.domain, ownerId: brand.user_id }, period, { onlyOptedIn: true, offset: -1, manual: false });
      return { sent: results.filter((r) => r.ok && !r.skipped).length, skipped: results.filter((r) => r.skipped).length, failed: results.filter((r) => !r.ok).length };
    });
  },
);
