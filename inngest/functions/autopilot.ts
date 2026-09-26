import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";
import { runAutopilot } from "@/lib/autopilot";

// Every 6 hours, fan out one job per brand that has Autopilot switched on.
// Each job decides for itself whether anything is due (a new post per the
// brand's cadence, otherwise a review of older posts), so a frequent tick
// costs nothing when there's nothing to do.
export const scheduledAutopilot = inngest.createFunction(
  { id: "autopilot-scheduled", triggers: [{ cron: "0 */6 * * *" }] },
  async ({ step }) => {
    const brandIds = await step.run("fetch-enabled", async () => {
      const { data, error } = await serverClient().from("autopilot_settings").select("brand_id").eq("enabled", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.brand_id as string);
    });
    if (!brandIds.length) return { queued: 0 };

    await step.sendEvent(
      "fan-out",
      brandIds.map((brandId) => ({ name: "autopilot/brand.requested" as const, data: { brandId } })),
    );
    return { queued: brandIds.length };
  },
);

// One brand, one run. "forced" is the dashboard's "Run now" button: it skips
// the cadence check (and works before Autopilot is switched on, so a customer
// can see what it would write) but every other guard still applies.
export const autopilotBrand = inngest.createFunction(
  {
    id: "autopilot-brand",
    // runAutopilot reports its own failures in the returned summary; a retry
    // would only pay for the same long generation again.
    retries: 0,
    concurrency: { limit: 3 },
    triggers: [{ event: "autopilot/brand.requested" }, { event: "autopilot/brand.forced" }],
  },
  async ({ event, step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { brandId } = (event as any).data as { brandId: string };
    return step.run("run-autopilot", () => runAutopilot(brandId, { force: event.name === "autopilot/brand.forced" }));
  },
);
