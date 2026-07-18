import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";

// Anonymous /setup drafts (brands.user_id IS NULL, created before the
// visitor confirms an account) that never get claimed are otherwise
// permanent garbage — every abandoned "try a domain" hit leaves one behind.
// tracked_prompts etc. cascade on the brands FK, so this one delete is enough.
export const cleanupAbandonedBrandDrafts = inngest.createFunction(
  { id: "cleanup-abandoned-brand-drafts", triggers: [{ cron: "0 5 * * *" }] },
  async ({ step }) => {
    const db = serverClient();
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const deleted = await step.run("delete-unclaimed-drafts", async () => {
      const { data, error } = await db
        .from("brands")
        .delete()
        .is("user_id", null)
        .lt("created_at", cutoff)
        .select("id");
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    });

    return { deleted };
  }
);
