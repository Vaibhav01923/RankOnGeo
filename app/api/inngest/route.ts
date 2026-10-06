import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scheduledScanAll, scanBrand, manualScanBrand } from "@/inngest/functions/scan";
import { reconcileDodoSubscriptions, reconcileEndedSubscriptions } from "@/inngest/functions/reconcile-subscriptions";
import { meterAnalyticsUsage } from "@/inngest/functions/analytics-billing";
import { cleanupAbandonedBrandDrafts } from "@/inngest/functions/cleanup";
import { scheduledAutopilot, autopilotBrand } from "@/inngest/functions/autopilot";
import { scheduledWeeklyReports, scheduledMonthlyReports, sendBrandReport } from "@/inngest/functions/reports";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scheduledScanAll, scanBrand, manualScanBrand, reconcileDodoSubscriptions, reconcileEndedSubscriptions, meterAnalyticsUsage, cleanupAbandonedBrandDrafts, scheduledAutopilot, autopilotBrand, scheduledWeeklyReports, scheduledMonthlyReports, sendBrandReport],
});
