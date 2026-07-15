import type { Metadata } from "next";
import { MarkdownArticle } from "../../_components/MarkdownArticle";
import { WebPageJsonLd } from "../../_components/WebPageJsonLd";

const DESCRIPTION = "How RankOnGeo collects, uses, and protects your information.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: DESCRIPTION,
};

const LAST_UPDATED = "July 14, 2026";

const CONTENT = `
RankOnGeo ("RankOnGeo," "we," "us," or "our") provides a platform that helps businesses track and improve their visibility in AI-powered search and chat products (like ChatGPT, Claude, Gemini, and Perplexity), generate SEO content, and monitor related social and web activity (the "Service"). This Privacy Policy explains what information we collect, how we use it, and the choices you have.

By using the Service, you agree to the collection and use of information as described in this policy. If you do not agree, please do not use the Service.

## 1. Information We Collect

**Account information.** When you create an account, we collect your email address and a password (stored securely by our authentication provider and never in plain text). If another user invites you to a shared workspace, we collect your email address to send and manage that invitation.

**Brand and business information.** To provide the Service, we collect information you give us about the brand(s) you track: website domain, brand name, industry/niche, description, target audience, and competitor names. We also store the search queries ("prompts") you or we generate to track how AI engines respond about your brand.

**AI engine scan results.** To measure your visibility, we send your tracked prompts to third-party AI providers (see "Third-Party Service Providers" below) and store their responses, including whether your brand was mentioned, its position in the response, competitor mentions, and any cited sources.

**Website analytics (Web + LLM Analytics feature).** If you enable this feature, we collect visit data from your own website's visitors — page paths, referrers, session identifiers, and whether a visit came from a known AI crawler/bot (e.g. GPTBot, ClaudeBot). We do not knowingly collect end-visitor names, emails, or other directly identifying information through this feature; visitor and session identifiers are pseudonymous. If your website's visitors are individuals located in the EEA, UK, or California, you (the RankOnGeo customer) are responsible for your own visitor-facing privacy notice, and we act as a data processor on your behalf for this data.

**Reddit integration.** If you connect a Reddit account, we store the OAuth access and refresh tokens needed to act on your behalf and your Reddit username. You can disconnect this at any time.

**Publishing integrations.** If you connect a publishing destination (WordPress, Webflow, Discord, or a custom webhook), we store the connection details — URL and API key or token — needed to publish content on your behalf.

**Payment information.** We use Dodo Payments as our payment processor. We do not store your full card number or other sensitive payment details — Dodo Payments handles that directly and is responsible for its own security and compliance. We store your subscription plan, billing status, and Dodo customer/subscription identifiers.

**Communications.** If you contact us for support, we collect the content of your messages and anything you choose to share to help us resolve your request.

**Usage data.** We automatically collect standard technical information such as IP address, browser type, device information, and pages visited, generally through cookies and similar technologies (see "Cookies" below).

## 2. How We Use Information

We use the information we collect to:

- Provide, operate, and maintain the Service — running scans, generating scores, publishing content, analytics
- Process payments and manage subscriptions
- Send service-related communications (scan results, billing notices, security alerts)
- Respond to support requests
- Improve and develop the Service
- Detect, prevent, and address fraud, abuse, or technical issues
- Comply with legal obligations

We do not sell your personal information.

## 3. Third-Party Service Providers

To deliver the Service, we share the necessary information with these categories of third-party providers, who process it under their own terms and privacy policies:

- **AI model providers** — OpenAI (ChatGPT), Google (Gemini), and, via DataForSEO's AI Optimization API, Anthropic (Claude) and Perplexity. We send your tracked prompt text (and, where applicable, permit these providers' own web-search features) to generate the responses we score.
- **Search/SEO data provider** — DataForSEO, for AI engine responses and Google AI Overview/search result data.
- **Payment processor** — Dodo Payments, for subscription billing.
- **Database and authentication** — Supabase, which hosts our application database and manages account authentication.
- **Email delivery** — Resend, for transactional emails such as invites and notifications.
- **Reddit** — the Reddit API, if you connect a Reddit account.
- **Publishing destinations** — WordPress, Webflow, Discord, or your own webhook endpoint, if you configure one.

We only share what's necessary for each provider to perform its function, and require that they handle it in accordance with applicable data protection law.

## 4. Cookies

We use cookies and similar technologies to keep you signed in, remember your preferences, and understand how our marketing site is used. You can control cookies through your browser settings; disabling them may affect your ability to use the Service.

## 5. Data Retention

We retain your information for as long as your account is active or as needed to provide the Service. If you delete your account or a tracked brand, we delete the associated data within a reasonable period, except where we must retain it for legal, tax, or accounting purposes, or where it remains in encrypted backups until they naturally expire.

## 6. Your Rights

Depending on where you live, you may have rights to access, correct, export, or delete your personal information, or to object to or restrict certain processing. To exercise these rights, contact us at **support@rankongeo.com**. We will respond within the time required by applicable law.

## 7. Data Security

We use industry-standard measures to protect your information, including encryption in transit, row-level access controls on our database, and restricted internal access. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.

## 8. International Data Transfers

Our infrastructure providers may process and store data in locations outside your home country, including the United States and India. By using the Service, you consent to this transfer, storage, and processing.

## 9. Children's Privacy

The Service is not directed to individuals under 18. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, contact us and we will delete it.

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. We'll post the updated version here with a new "Last updated" date, and communicate material changes by email or an in-app notice.

## 11. Contact Us

Questions about this Privacy Policy? Contact us at **support@rankongeo.com**.
`;

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <WebPageJsonLd name="Privacy Policy" description={DESCRIPTION} path="/privacy" />
      <header className="mb-10">
        <p className="mb-3 text-xs text-[var(--ink-faint)]">Last updated: {LAST_UPDATED}</p>
        <h1 className="font-signal-serif text-4xl font-[350] leading-tight tracking-tight text-[var(--ink)] sm:text-5xl">
          Privacy Policy
        </h1>
      </header>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-8 py-9 sm:px-10">
        <MarkdownArticle content={CONTENT} />
      </div>
    </div>
  );
}
