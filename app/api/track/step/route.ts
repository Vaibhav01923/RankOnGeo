import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";

const STEP_NAMES = ["url", "brand", "prompts", "reddit", "trial"] as const;

// Funnel-step reach tracking for the /setup wizard (see app/setup/page.tsx) —
// one event per step a visitor actually reaches, so /admin/stats can show
// how many people made it to step 1 vs 2 vs ... vs 5 (trial). Deduped
// client-side per page load (see stepsLoggedRef in app/setup/page.tsx), not
// server-side — going back and forward within one visit only logs once, but
// this isn't a hard uniqueness guarantee across reloads.
export async function POST(req: NextRequest) {
  const { step, stepName, domain } = await req.json().catch(() => ({}));
  if (typeof step !== "number" || !Number.isInteger(step) || step < 1 || step > 5) {
    return NextResponse.json({ error: "step must be an integer 1-5" }, { status: 400 });
  }
  if (typeof stepName !== "string" || !STEP_NAMES.includes(stepName as (typeof STEP_NAMES)[number])) {
    return NextResponse.json({ error: "invalid stepName" }, { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();

  const { error } = await serverClient().from("funnel_events").insert({
    event_type: "setup_step_reached",
    domain: typeof domain === "string" ? domain.slice(0, 200) : null,
    user_id: user?.id ?? null,
    is_anonymous: !user,
    metadata: { step, stepName },
  });
  if (error) console.error("[track/step] insert failed", error.message);

  return NextResponse.json({ ok: true });
}
