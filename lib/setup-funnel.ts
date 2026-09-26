// The /setup wizard's funnel vocabulary, shared by the tracking route, the
// wizard and /admin/stats so a new step or action is added in one place.

export const SETUP_STEPS = ["url", "brand", "keywords", "blogs", "prompts", "reddit", "offer", "trial"] as const;
export type SetupStepName = (typeof SETUP_STEPS)[number];

export const SETUP_STEP_LABELS: Record<SetupStepName, string> = {
  url: "Website",
  brand: "Brand info",
  keywords: "Keywords",
  blogs: "Blogs",
  prompts: "GEO prompts",
  reddit: "Reddit",
  offer: "Offer",
  trial: "Trial",
};

// What a visitor can do on the offer step (step 7), in the order they usually happen.
export const OFFER_ACTIONS = ["features_seen", "backlink_email_clicked", "cta_clicked", "back_clicked"] as const;
export type OfferAction = (typeof OFFER_ACTIONS)[number];

export const OFFER_ACTION_LABELS: Record<OfferAction, string> = {
  features_seen: "Watched all features",
  backlink_email_clicked: "Opened backlink email",
  cta_clicked: "Clicked start trial",
  back_clicked: "Went back",
};

export function isSetupStep(v: unknown): v is SetupStepName {
  return typeof v === "string" && (SETUP_STEPS as readonly string[]).includes(v);
}

export function isOfferAction(v: unknown): v is OfferAction {
  return typeof v === "string" && (OFFER_ACTIONS as readonly string[]).includes(v);
}
