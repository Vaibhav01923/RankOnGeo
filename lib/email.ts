// Minimal transactional email via Resend's REST API — no SDK dependency.
// Skips gracefully (returns { sent: false }) when RESEND_API_KEY isn't
// configured, so callers never fail a payment flow over a missing email.

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "RankOnGeo <hello@rankongeo.com>";
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", to);
    return { sent: false, error: "not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] Resend error", res.status, body);
      return { sent: false, error: `Resend ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { sent: false, error: String(err) };
  }
}

export function teamInviteEmailHtml(inviterEmail: string, acceptUrl: string): string {
  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Georgia,serif;color:#302821;background:#f6f2e9;">
  <div style="font-size:22px;font-weight:700;margin-bottom:24px;">RankOnGeo</div>
  <h1 style="font-size:28px;font-weight:400;line-height:1.25;margin:0 0 16px;">You've been invited. 🤝</h1>
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;margin:0 0 14px;">
    <strong>${inviterEmail}</strong> invited you to join their RankOnGeo workspace —
    you'll get access to their brands, AI visibility scans, articles, and analytics.
  </p>
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;margin:0 0 14px;">
    Accept the invite with the button below. If you don't have an account yet, sign up
    with this email address and the invite will be waiting for you.
  </p>
  <a href="${acceptUrl}"
     style="display:inline-block;margin:10px 0 22px;padding:12px 26px;background:#b1552e;color:#fffdf8;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">
    Accept invite
  </a>
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#6f6257;margin:0;">
    This invite expires in 7 days. If you weren't expecting it, you can ignore this email.
    <br/>— The RankOnGeo team
  </p>
</div>`;
}

export function earlyWaitlistEmailHtml(plan: string): string {
  const planNames: Record<string, string> = { starter: "Pro", growth: "Business", enterprise: "Scale" };
  const planName = planNames[plan] ?? plan;
  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Georgia,serif;color:#302821;background:#f6f2e9;">
  <div style="font-size:22px;font-weight:700;margin-bottom:24px;">RankOnGeo</div>
  <h1 style="font-size:28px;font-weight:400;line-height:1.25;margin:0 0 16px;">Congrats — you're in. 🌱</h1>
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;margin:0 0 14px;">
    You're officially on the RankOnGeo early list, and your <strong>${planName}</strong> plan is active
    at a flat <strong>50% off</strong> — locked in because you backed us early.
  </p>
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;margin:0 0 14px;">
    Your dashboard is ready: add your brand, and within a minute you'll see how ChatGPT, Claude, Gemini,
    Perplexity and AI Overviews answer when your customers ask about what you do.
  </p>
  <a href="https://www.rankongeo.com/dashboard"
     style="display:inline-block;margin:10px 0 22px;padding:12px 26px;background:#b1552e;color:#fffdf8;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">
    Open your dashboard
  </a>
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#6f6257;margin:0;">
    Questions or ideas? Just reply — early users talk straight to the people building this.
    <br/>— The RankOnGeo team, grown under a night sky
  </p>
</div>`;
}
