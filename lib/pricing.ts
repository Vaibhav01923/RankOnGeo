// Shared plan data — lives outside app/_components/PricingCards.tsx (a "use
// client" module) so server components (e.g. app/page.tsx's JSON-LD) can
// import the plain array directly. Importing plain data from a "use client"
// file doesn't work: Next.js wraps every export of a client module in a
// client reference, even non-component data, so a server component sees a
// proxy rather than the real array.
export const PRICING = [
  {
    name: "Pro",
    planKey: "starter",
    desc: "Everything RankOnGeo does, one plan.",
    price: 40,
    highlight: true,
    features: [
      "40 credits for Reddit upvotes, comments, comment upvotes & more",
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
