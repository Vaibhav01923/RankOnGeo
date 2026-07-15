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
    desc: "For solo founders proving the channel.",
    price: 49,
    highlight: false,
    features: [
      "50 credits for Reddit upvotes, comments, comment upvotes & more",
      "10 tracked prompts × 5 AI engines = 50 checks/scan",
      "1 website",
      "20,000 web + LLM analytics events / mo",
      "Unlimited SEO articles",
      "Gap detection & gap → article",
      "Daily visibility updates",
      "Competitor tracking",
      "Auto-publish to WordPress, Shopify & Framer",
      "Email support",
    ],
  },
  {
    name: "Business",
    planKey: "growth",
    desc: "For teams that want the loop on autopilot.",
    price: 99,
    highlight: true,
    features: [
      "100 credits for Reddit upvotes, comments, comment upvotes & more",
      "20 tracked prompts × 5 AI engines = 100 checks/scan",
      "2 websites",
      "100,000 web + LLM analytics events / mo",
      "Unlimited SEO articles",
      "Gap detection & gap → article",
      "Daily visibility updates",
      "Competitor tracking",
      "Auto-publish to WordPress, Shopify & Framer",
      "Email support",
    ],
  },
  {
    name: "Scale",
    planKey: "enterprise",
    desc: "For agencies & multi-brand portfolios.",
    price: 149,
    highlight: false,
    features: [
      "150 credits for Reddit upvotes, comments, comment upvotes & more",
      "50 tracked prompts × 5 AI engines = 250 checks/scan",
      "3 websites",
      "500,000 web + LLM analytics events / mo",
      "Unlimited SEO articles",
      "Gap detection & gap → article",
      "Daily visibility updates",
      "Competitor tracking",
      "Auto-publish to WordPress, Shopify & Framer",
      "Email support",
    ],
  },
];
