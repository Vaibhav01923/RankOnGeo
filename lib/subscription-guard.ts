// Stops a customer who is already subscribed from starting a second, parallel
// subscription (which would bill them twice). Kept free of app imports so the
// checks can be tested with a fake Dodo client.

// Statuses in which the customer is still being billed: "active", or
// "on_hold" while Dodo retries a failed payment. Cancelled, expired, failed and
// never-completed ("pending") subscriptions don't count.
export function isLiveStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "on_hold";
}

// Accounts given the product for free on purpose (the founder's own workspace,
// a comped customer) store this in user_plans.dodo_subscription_id. Every "is
// this account paid?" check only asks whether that column is set, so they get
// full access; code that talks to Dodo skips it, since it isn't a Dodo
// subscription and no webhook will ever cancel it.
export const COMPLIMENTARY_SUBSCRIPTION_ID = "comp_admin";

// Dodo subscription ids look like "sub_…"; anything else is the marker above.
export function isDodoSubscriptionId(id: string | null | undefined): id is string {
  return !!id && id.startsWith("sub_");
}

type SubscriptionLookup = { subscriptions: { retrieve(id: string): Promise<{ status: string }> } };

// Asks Dodo, not just our database: the id we store can outlive the subscription
// if a webhook was missed. A subscription Dodo doesn't know (404) is not live. If
// the lookup fails for any other reason we can't tell, so we treat it as live,
// since blocking one purchase attempt is cheaper than charging someone twice.
// Complimentary access counts as live: that account already has everything.
export async function hasLiveSubscription(dodo: SubscriptionLookup, subscriptionId: string | null | undefined): Promise<boolean> {
  if (!subscriptionId) return false;
  if (!isDodoSubscriptionId(subscriptionId)) return true;
  try {
    const sub = await dodo.subscriptions.retrieve(subscriptionId);
    return isLiveStatus(sub.status);
  } catch (e) {
    if ((e as { status?: number } | null)?.status === 404) return false;
    console.error("[subscription-guard] Dodo lookup failed", e instanceof Error ? e.message : e);
    return true;
  }
}

export const ALREADY_SUBSCRIBED_MESSAGE =
  "You already have an active subscription, so we can't start another one. Manage it from Settings. To switch between monthly and yearly billing, cancel there (it stays active until the period ends) and subscribe again after.";
