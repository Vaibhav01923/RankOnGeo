import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { SETUP_STEPS, isOfferAction, isSetupStep } from "@/lib/setup-funnel";

// Funnel-step reach tracking for the /setup wizard (see app/setup/page.tsx) —
// one event per step a visitor actually reaches, so /admin/stats can show
// how many people made it to step 1 vs 2 vs ... vs 8 (trial). Deduped
// client-side per page load (see stepsLoggedRef in app/setup/page.tsx), not
// server-side — going back and forward within one visit only logs once, but
// this isn't a hard uniqueness guarantee across reloads.
//
// With an `action` (offer step only) it logs what the visitor did on that step
// instead of that they reached it — see OFFER_ACTIONS in lib/setup-funnel.ts.
export async function POST(req: NextRequest) {
  const { step, stepName, domain, action } = await req.json().catch(() => ({}));
  if (typeof step !== "number" || !Number.isInteger(step) || step < 1 || step > SETUP_STEPS.length) {
    return NextResponse.json({ error: `step must be an integer 1-${SETUP_STEPS.length}` }, { status: 400 });
  }
  // The number is only checked for range: a tab opened before a deploy may still send an older numbering.
  if (!isSetupStep(stepName)) {
    return NextResponse.json({ error: "invalid stepName" }, { status: 400 });
  }
  if (action !== undefined && (stepName !== "offer" || !isOfferAction(action))) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();

  const { error } = await serverClient().from("funnel_events").insert({
    event_type: action ? "setup_offer_action" : "setup_step_reached",
    domain: typeof domain === "string" ? domain.slice(0, 200) : null,
    user_id: user?.id ?? null,
    is_anonymous: !user,
    metadata: action ? { step, stepName, action } : { step, stepName },
  });
  if (error) console.error("[track/step] insert failed", error.message);

  return NextResponse.json({ ok: true });
}
