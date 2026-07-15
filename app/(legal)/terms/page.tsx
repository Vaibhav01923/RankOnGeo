import type { Metadata } from "next";
import { MarkdownArticle } from "../../_components/MarkdownArticle";
import { WebPageJsonLd } from "../../_components/WebPageJsonLd";

const DESCRIPTION = "The terms that govern your use of RankOnGeo.";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: DESCRIPTION,
};

const LAST_UPDATED = "July 14, 2026";

const CONTENT = `
These Terms of Service ("Terms") govern your access to and use of RankOnGeo (the "Service"), operated by RankOnGeo ("we," "us," or "our"). By creating an account or using the Service, you agree to these Terms. If you're using the Service on behalf of a company or other entity, you represent that you have the authority to bind that entity, and "you" refers to that entity.

## 1. The Service

RankOnGeo helps businesses track how their brand is represented in AI-powered search and chat products (such as ChatGPT, Claude, Gemini, and Perplexity), generate SEO content, monitor citations, and optionally engage with related social platforms (such as Reddit) and publish content to connected destinations (such as WordPress, Webflow, Discord, or a custom webhook).

The Service relies on third-party AI models, search data providers, and other platforms we don't control. We don't guarantee the accuracy, availability, or continued operation of any third-party service the Service depends on, and we're not responsible for changes those providers make to their own products, pricing, or terms.

## 2. Accounts

You must provide accurate information when creating an account and keep your login credentials secure. You're responsible for all activity under your account, including activity by team members you invite to a shared workspace. You must be at least 18 years old to use the Service.

## 3. Subscriptions and Billing

Paid plans are billed in advance on a recurring basis (monthly, or as otherwise stated at checkout) through our payment processor, Dodo Payments. By subscribing, you authorize us, via Dodo Payments, to charge your payment method on each billing cycle until you cancel.

**No refunds.** Except where required by law, payments are non-refundable, including for partial billing periods. You may cancel your subscription at any time; cancellation stops future billing but doesn't entitle you to a refund for the current billing period. You'll retain access to paid features through the end of the period you've already paid for.

We may change our pricing or plan limits — such as the number of tracked brands, prompts, or included analytics events — at any time. Changes apply to future billing cycles, and where required, we'll give notice in advance.

## 4. Acceptable Use

You agree not to use the Service to:

- Violate any applicable law or regulation
- Infringe the intellectual property or other rights of any third party
- Submit false or misleading content, or attempt to manipulate AI engine responses through fraudulent means
- Interfere with or disrupt the Service or its underlying infrastructure
- Circumvent any usage limits associated with your plan
- Harass, spam, or abuse other users or third parties

**Third-party platform compliance.** Features that interact with third-party platforms — including Reddit engagement features and content-publishing integrations — operate subject to those platforms' own terms of service. You're solely responsible for ensuring your use of these features complies with the applicable third-party platform's rules. We don't guarantee any particular outcome (such as upvotes, comments, rankings, or approval) from these features, and we may suspend a feature if a third-party platform changes its terms or restricts our access.

## 5. AI-Generated Content

Some features of the Service — including SEO article generation and AI engine scan responses — use artificial intelligence to generate content. AI-generated content may be inaccurate, incomplete, or unsuitable for your purposes. You're responsible for reviewing, fact-checking, and editing any AI-generated content before publishing or relying on it. We make no warranty as to the accuracy of AI-generated content or of any score, ranking, or visibility metric the Service produces.

## 6. Your Content

You retain ownership of the brand information, prompts, and other content you submit to the Service ("Your Content"). You grant us a limited license to use Your Content solely to provide and improve the Service. You represent that you have the rights necessary to submit Your Content and that it doesn't infringe any third party's rights.

## 7. Our Intellectual Property

The Service, including its software, design, and underlying technology, is owned by us or our licensors and protected by intellectual property laws. These Terms don't grant you any rights to our trademarks, logos, or brand features except as necessary to use the Service as intended.

## 8. Team Workspaces

If you invite team members to a shared workspace, the workspace owner — the paying account holder — is responsible for that workspace's billing and for the actions of every member they invite. The owner may revoke a member's access at any time.

## 9. Termination

You may stop using the Service and cancel your subscription at any time through your account settings. We may suspend or terminate your access if you violate these Terms, if required by law, or if we discontinue the Service, with notice where reasonably practicable. Provisions of these Terms that by their nature should survive termination — including ownership, disclaimers, and limitation of liability — will continue to apply.

## 10. Disclaimers

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT IT WILL RESULT IN ANY PARTICULAR IMPROVEMENT IN YOUR BRAND'S VISIBILITY, RANKING, OR TRAFFIC.

## 11. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, RANKONGEO AND ITS OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE THREE MONTHS PRECEDING THE CLAIM.

## 12. Indemnification

You agree to indemnify and hold us harmless from any claims, damages, or expenses — including reasonable attorneys' fees — arising from your use of the Service, Your Content, or your violation of these Terms or any third-party platform's terms.

## 13. Governing Law

These Terms are governed by the laws of the State of Delaware, United States, without regard to its conflict of laws principles. Any dispute arising from these Terms or the Service will be resolved in the state or federal courts located in Delaware, and you consent to the exclusive jurisdiction of those courts.

## 14. Changes to These Terms

We may update these Terms from time to time. We'll post the updated version here with a new "Last updated" date, and for material changes, we'll provide reasonable notice — such as an email or in-app notice. Your continued use of the Service after a change takes effect constitutes acceptance of the updated Terms.

## 15. Contact Us

Questions about these Terms? Contact us at **support@rankongeo.com**.
`;

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <WebPageJsonLd name="Terms of Service" description={DESCRIPTION} path="/terms" />
      <header className="mb-10">
        <p className="mb-3 text-xs text-[var(--ink-faint)]">Last updated: {LAST_UPDATED}</p>
        <h1 className="font-signal-serif text-4xl font-[350] leading-tight tracking-tight text-[var(--ink)] sm:text-5xl">
          Terms of Service
        </h1>
      </header>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-8 py-9 sm:px-10">
        <MarkdownArticle content={CONTENT} />
      </div>
    </div>
  );
}
