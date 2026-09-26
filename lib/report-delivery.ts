import { sendEmail } from "@/lib/email";
import { isUnpaidPlan } from "@/lib/plan-limits";
import { collectReport } from "@/lib/report-data";
import { reportDiscord, reportEmailHtml, reportSlack, reportSubject, reportWebhook } from "@/lib/report-format";
import type { Report, ReportPeriod } from "@/lib/report";
import { isEmail, isSafeWebhookUrl } from "@/lib/webhook-url";

// Sends a brand's report to the destinations that want it, and writes what happened to
// the delivery log (alert_deliveries). Scheduled sends are recorded with the period they
// were for, so the same report is never sent to the same place twice.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Destination = { id: string; brand_id: string; name: string; kind: string; url: string | null; email: string | null; status: string; weekly_report?: boolean; monthly_report?: boolean };
export type DeliveryResult = { destinationId: string; name: string; kind: string; ok: boolean; skipped?: boolean; error?: string };

export async function sendReportToDestination(dest: Destination, report: Report): Promise<{ ok: boolean; error?: string }> {
  try {
    if (dest.kind === "email") {
      if (!isEmail(dest.email)) return { ok: false, error: "This destination has no valid email address." };
      const res = await sendEmail({ to: dest.email, subject: reportSubject(report), html: reportEmailHtml(report) });
      return res.sent ? { ok: true } : { ok: false, error: res.error === "not configured" ? "Email sending isn't set up on the server yet." : `Email failed (${res.error ?? "unknown"}).` };
    }
    if (dest.kind === "slack" || dest.kind === "discord" || dest.kind === "webhook") {
      if (!isSafeWebhookUrl(dest.kind, dest.url)) return { ok: false, error: "This destination's URL isn't allowed. Edit it and paste the webhook URL again." };
      const body = dest.kind === "slack" ? reportSlack(report) : dest.kind === "discord" ? reportDiscord(report) : reportWebhook(report);
      const res = await fetch(dest.url as string, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!res.ok) return { ok: false, error: `${dest.kind} answered HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
      return { ok: true };
    }
    return { ok: false, error: `Unknown destination type: ${dest.kind}` };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300) };
  }
}

export type DeliverOptions = {
  // Scheduled runs only go to destinations that switched this period's report on;
  // "send now" goes to whichever destinations were picked.
  onlyOptedIn: boolean;
  destinationIds?: string[];
  // 0 = the period so far, -1 = the last finished one (what schedules send).
  offset: number;
  manual: boolean;
};

export async function deliverReport(db: Db, brand: { id: string; name: string; domain: string; ownerId: string }, period: ReportPeriod, opts: DeliverOptions): Promise<{ results: DeliveryResult[]; report: Report | null }> {
  let q = db.from("alert_destinations").select("id, brand_id, name, kind, url, email, status, weekly_report, monthly_report").eq("brand_id", brand.id).eq("status", "active");
  if (opts.onlyOptedIn) q = q.eq(period === "weekly" ? "weekly_report" : "monthly_report", true);
  if (opts.destinationIds?.length) q = q.in("id", opts.destinationIds);
  const { data } = await q;
  const destinations = (data ?? []) as Destination[];
  if (!destinations.length) return { results: [], report: null };

  const report = await collectReport(db, brand, period, opts.offset);
  const eventType = opts.manual ? "report_manual" : `${period}_report`;
  const periodKey = opts.manual ? null : report.range.key;

  const results = await Promise.all(
    destinations.map(async (dest): Promise<DeliveryResult> => {
      const base = { destinationId: dest.id, name: dest.name, kind: dest.kind };
      if (periodKey) {
        const { data: done } = await db.from("alert_deliveries").select("id").eq("destination_id", dest.id).eq("event_type", eventType).eq("period_key", periodKey).eq("status", "succeeded").limit(1);
        if (done?.length) return { ...base, ok: true, skipped: true };
      }
      const res = await sendReportToDestination(dest, report);
      await db.from("alert_deliveries").insert({ destination_id: dest.id, brand_id: brand.id, event_type: eventType, period_key: periodKey, status: res.ok ? "succeeded" : "failed", error_detail: res.error ?? null });
      return { ...base, ok: res.ok, error: res.error };
    })
  );
  return { results, report };
}

// Brands that have at least one active destination wanting this period's report and an
// owner who is on a paid plan (reports are part of the paid product, like scheduled scans).
export async function brandsDueForReports(db: Db, period: ReportPeriod): Promise<string[]> {
  const { data: dests } = await db.from("alert_destinations").select("brand_id").eq("status", "active").eq(period === "weekly" ? "weekly_report" : "monthly_report", true);
  const brandIds = [...new Set(((dests ?? []) as { brand_id: string }[]).map((d) => d.brand_id))];
  if (!brandIds.length) return [];
  const { data: brands } = await db.from("brands").select("id, user_id").in("id", brandIds);
  const owners = [...new Set(((brands ?? []) as { user_id: string | null }[]).map((b) => b.user_id).filter((x): x is string => !!x))];
  const { data: plans } = owners.length ? await db.from("user_plans").select("user_id, dodo_customer_id, dodo_subscription_id, payment_failed_at").in("user_id", owners) : { data: [] };
  const planByUser = new Map(((plans ?? []) as { user_id: string }[]).map((p) => [p.user_id, p]));
  return ((brands ?? []) as { id: string; user_id: string | null }[]).filter((b) => b.user_id && !isUnpaidPlan(planByUser.get(b.user_id) as never)).map((b) => b.id);
}
