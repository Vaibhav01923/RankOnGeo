import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scheduledScanAll, scanBrand, manualScanBrand } from "@/inngest/functions/scan";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scheduledScanAll, scanBrand, manualScanBrand],
});
