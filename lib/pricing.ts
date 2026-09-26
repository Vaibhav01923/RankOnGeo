// Shared plan data — lives outside app/_components/PricingCards.tsx (a "use
// client" module) so server components (e.g. app/page.tsx's JSON-LD) can
// import the plain array directly. Importing plain data from a "use client"
// file doesn't work: Next.js wraps every export of a client module in a
// client reference, even non-component data, so a server component sees a
// proxy rather than the real array.
// Length of the free trial the setup wizard starts, in days. Long enough for
// Autopilot to publish a first blog post once it is switched on.
export const TRIAL_DAYS = 4;

export const PRICING = [
  {
    name: "Pro",
    planKey: "starter",
    desc: "Everything RankOnGeo does, one plan.",
    price: 29.99, // keep in step with the "RankOnGeo Pro" product price in Dodo, which is what checkout charges
    highlight: true,
    features: [
      "10 credits for Reddit upvotes, comments, comment upvotes & more",
      "10 tracked prompts × 5 AI engines = 50 checks/scan",
      "1 website",
      "20,000 analytics events / mo — traffic, AI referrals & AI crawlers",
      "Unlimited SEO articles",
      "Gap detection & gap → article",
      "Visibility updates every 3 days",
      "Competitor tracking",
      "Autopilot blog: written, published & refreshed for you (WordPress or your own site)",
      "Email support",
    ],
  },
];

// "$40" for whole-dollar prices, "$29.99" otherwise, so a plan priced at 29.99
// doesn't render as "$29.99" in one place and "$30" in another.
export function formatPlanPrice(price: number): string {
  return Number.isInteger(price) ? `$${price}` : `$${price.toFixed(2)}`;
}

// What the plan works out to per day over a 30-day month, e.g. "$1.33".
export function pricePerDay(price: number): string {
  return `$${(price / 30).toFixed(2)}`;
}
