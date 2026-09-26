import { num, pct, signed, changePct, type Delta, type Report } from "@/lib/report";

// Turns a Report into what each destination understands: HTML for email, blocks for
// Slack, embeds for Discord. Everything that came from a customer's site (article
// titles, keywords, page paths, prompts) is escaped for the format it lands in.

const SITE = "https://www.rankongeo.com";

export const reportKind = (r: Pick<Report, "period">) => (r.period === "weekly" ? "Weekly" : "Monthly");
export const reportTitle = (r: Report) => `${reportKind(r)} report: ${r.brand.name}`;
export const reportSubject = (r: Report) => `Your ${r.period} RankOnGeo report for ${r.brand.name} (${r.range.label})`;
export const dashboardUrl = (r: Report) => `${SITE}/dashboard?brandId=${encodeURIComponent(r.brand.id)}`;

// Only http(s) links are ever put into a message.
const safeUrl = (u: string | null | undefined): string | null => {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
};

const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// "+3", "-2" or "no change"; null when there is nothing to compare with.
function changeText(d: Delta | { change: number | null }, unit = ""): string {
  const c = d.change;
  if (c === null) return "";
  if (c === 0) return "no change";
  return `${signed(c)}${unit}`;
}

function deltaWithPct(d: Delta): string {
  const p = changePct(d);
  if (d.previous === null) return "";
  if (d.change === 0) return "same as last period";
  return p === null ? `${signed(d.change ?? 0)} vs last period` : `${signed(p)}% vs last period`;
}

function kpis(r: Report): { label: string; value: string; sub: string }[] {
  const out: { label: string; value: string; sub: string }[] = [
    { label: "AI visibility", value: r.visibility.score === null ? "—" : `${r.visibility.score}%`, sub: r.visibility.change === null ? (r.visibility.score === null ? "no scan yet" : "") : `${changeText(r.visibility, " pts")} since previous scan` },
    { label: "Articles published", value: String(r.articles.publishedCount), sub: r.articles.previousPublishedCount ? `${r.articles.previousPublishedCount} last period` : "" },
  ];
  if (r.traffic.available) {
    out.push({ label: "Visitors", value: num(r.traffic.visitors.value), sub: deltaWithPct(r.traffic.visitors) });
    out.push({ label: "From AI answers", value: num(r.traffic.aiVisits.value), sub: deltaWithPct(r.traffic.aiVisits) });
  }
  if (r.crawlers.available) out.push({ label: "AI crawler visits", value: num(r.crawlers.total.value), sub: deltaWithPct(r.crawlers.total) });
  if (r.search.connected && r.search.clicks) out.push({ label: "Google clicks", value: num(r.search.clicks.value), sub: deltaWithPct(r.search.clicks) });
  return out;
}

// ---- email -----------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const H2 = (t: string) => `<h2 style="font-family:Georgia,serif;font-size:19px;font-weight:400;margin:28px 0 10px;color:#302821;">${esc(t)}</h2>`;
const P = (t: string, muted = false) => `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;margin:0 0 10px;color:${muted ? "#6f6257" : "#302821"};">${t}</p>`;

export function reportEmailHtml(r: Report): string {
  const cards = kpis(r);
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 3) {
    rows.push(
      `<tr>${cards
        .slice(i, i + 3)
        .map(
          (c) =>
            `<td style="width:33%;padding:6px;vertical-align:top;"><div style="background:#fffdf8;border:1px solid #e4dccb;border-radius:12px;padding:12px 14px;"><div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a7c6d;">${esc(c.label)}</div><div style="font-family:Georgia,serif;font-size:28px;color:#302821;margin:2px 0;">${esc(c.value)}</div><div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#6f6257;">${esc(c.sub)}</div></div></td>`
        )
        .join("")}${"<td></td>".repeat(Math.max(0, 3 - cards.slice(i, i + 3).length))}</tr>`
    );
  }

  const list = (items: string[]) => `<ul style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;margin:0 0 6px;padding-left:20px;color:#302821;">${items.map((i) => `<li style="margin-bottom:4px;">${i}</li>`).join("")}</ul>`;
  const s: string[] = [];

  s.push(H2("What RankOnGeo did"));
  s.push(list(r.activity.map(esc)));

  s.push(H2(`Articles published (${r.articles.publishedCount})`));
  if (r.articles.published.length) {
    s.push(
      list(
        r.articles.published.slice(0, 15).map((a) => {
          const url = safeUrl(a.url);
          const title = url ? `<a href="${esc(url)}" style="color:#b1552e;">${esc(a.title)}</a>` : esc(a.title);
          const meta = [shortDate(a.publishedAt), r.traffic.available && a.url ? `${a.views} view${a.views === 1 ? "" : "s"}${a.aiVisits ? `, ${a.aiVisits} from AI` : ""}` : ""].filter(Boolean).join(" · ");
          return `${title}<br/><span style="color:#8a7c6d;font-size:12px;">${esc(meta)}</span>`;
        })
      )
    );
    if (r.articles.published.length > 15) s.push(P(`…and ${r.articles.published.length - 15} more in your dashboard.`, true));
  } else {
    s.push(P(r.articles.autopublishOn ? "Nothing went live in this period. Auto-publishing is on, so the next article is on its way." : "Nothing went live in this period. Turn on auto-publishing in the SEO &amp; GEO tab and RankOnGeo will write and publish for you.", true));
  }
  if (r.articles.draftsWritten) s.push(P(`${r.articles.draftsWritten} more draft${r.articles.draftsWritten === 1 ? " is" : "s are"} waiting for your review.`));

  s.push(H2("AI visibility"));
  if (r.visibility.score === null) s.push(P("No scan has run yet.", true));
  else {
    s.push(P(`Score <strong>${r.visibility.score}%</strong>${r.visibility.change !== null ? ` (${changeText(r.visibility, " pts")} since the previous scan)` : ""}. ${r.visibility.scannedInPeriod ? `${r.visibility.scans} scan${r.visibility.scans === 1 ? "" : "s"} ran in this period.` : `Latest scan was ${shortDate(r.visibility.lastScanAt)}; no new scan ran in this period.`}`));
    if (r.visibility.engines.length) s.push(list(r.visibility.engines.map((e) => `${esc(e.label)}: <strong>${e.score}%</strong>${e.change ? ` <span style="color:${e.change > 0 ? "#3f7d3a" : "#b03a2e"};">(${signed(e.change)})</span>` : ""}`)));
    if (r.visibility.topGaps.length) {
      s.push(P(`<strong>Biggest gaps</strong>, questions where AI answers without naming you (${r.visibility.gapsNow} open${r.visibility.gapsPrevious !== null ? `, ${r.visibility.gapsPrevious} at the previous scan` : ""}):`));
      s.push(list(r.visibility.topGaps.map((g) => `“${esc(g.prompt)}” <span style="color:#8a7c6d;font-size:12px;">missing from ${esc(g.engines.join(", "))}${g.competitor ? `; ${esc(g.competitor)} shown instead` : ""}</span>`)));
    }
  }

  if (r.traffic.available) {
    s.push(H2("Traffic"));
    if (r.traffic.pageviews.value === 0) s.push(P("No visits were tracked in this period.", true));
    else {
      s.push(P(`${num(r.traffic.pageviews.value)} pageviews from ${num(r.traffic.visitors.value)} visitors (${deltaWithPct(r.traffic.visitors) || "first period tracked"}).`));
      if (r.traffic.aiSources.length) s.push(P(`<strong>From AI answers:</strong> ${r.traffic.aiSources.map((x) => `${esc(x.label)} ${x.count}`).join(", ")}.`));
      if (r.traffic.topPages.length) s.push(P(`<strong>Top pages:</strong> ${r.traffic.topPages.map((x) => `${esc(clip(x.path, 50))} (${x.views})`).join(", ")}.`));
    }
  }
  if (r.crawlers.available) {
    s.push(H2("AI crawlers"));
    s.push(r.crawlers.total.value ? P(`${num(r.crawlers.total.value)} visit${r.crawlers.total.value === 1 ? "" : "s"} from AI crawlers: ${r.crawlers.byBot.map((x) => `${esc(x.label)} ${x.count}`).join(", ")}.`) : P("No AI crawler visits were recorded in this period.", true));
  }
  if (r.search.connected) {
    s.push(H2("Google Search"));
    if (r.search.clicks && r.search.impressions) {
      s.push(P(`${num(r.search.impressions.value)} impressions and ${num(r.search.clicks.value)} clicks${r.search.position !== null ? `, average position ${r.search.position.toFixed(1)}` : ""}${r.search.ctr !== null && r.search.impressions.value ? ` (${pct(r.search.ctr, 1)} click rate)` : ""}.`));
      if (r.search.topQueries.length) s.push(P(`<strong>Top searches:</strong> ${r.search.topQueries.map((q) => `“${esc(q.label)}” (${q.clicks} clicks)`).join(", ")}.`));
    }
    s.push(P(esc(r.search.note), true));
  }
  if (r.reddit.tasks) {
    s.push(H2("Reddit engagement"));
    s.push(P(`${r.reddit.tasks} task${r.reddit.tasks === 1 ? "" : "s"} (${r.reddit.completed} completed), ${r.reddit.upvotes} upvotes ordered, ${r.reddit.comments} post${r.reddit.comments === 1 ? "" : "s"}/comments, ${num(r.reddit.creditsSpent)} credits used.`));
  }
  if (r.articles.upcoming.length) {
    s.push(H2("Coming up next"));
    s.push(list(r.articles.upcoming.slice(0, 5).map((u) => `${esc(u.keyword)} <span style="color:#8a7c6d;font-size:12px;">${u.kind === "prompt" ? "AI prompt" : "keyword"}${u.scheduledAt ? `, about ${shortDate(u.scheduledAt)}` : ""}</span>`)));
  }

  return `
<div style="max-width:620px;margin:0 auto;padding:28px 20px;background:#f6f2e9;">
  <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#302821;margin-bottom:18px;">RankOnGeo</div>
  <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a7c6d;">${esc(reportKind(r))} report · ${esc(r.range.label)}${r.range.inProgress ? " · so far" : ""}</div>
  <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:400;line-height:1.25;margin:6px 0 8px;color:#302821;">${esc(r.brand.name)}</h1>
  ${P(esc(r.headline) + ".")}
  <table role="presentation" style="width:100%;border-collapse:collapse;margin:10px -6px 0;">${rows.join("")}</table>
  ${s.join("\n  ")}
  <a href="${esc(dashboardUrl(r))}" style="display:inline-block;margin:22px 0 14px;padding:12px 26px;background:#b1552e;color:#fffdf8;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">Open your dashboard</a>
  ${P(`You get this because ${esc(r.period)} reports are switched on for ${esc(r.brand.domain)}. Change it any time in Reports → Get this report automatically.`, true)}
</div>`;
}

// ---- Slack -----------------------------------------------------------------

const slackEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slackLink = (url: string | null, text: string) => (url ? `<${url}|${slackEsc(text).replace(/\|/g, "¦")}>` : slackEsc(text));

export function reportSlack(r: Report) {
  const fields = kpis(r).map((c) => ({ type: "mrkdwn", text: `*${slackEsc(c.label)}*\n${slackEsc(c.value)}${c.sub ? `\n_${slackEsc(c.sub)}_` : ""}` }));
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: clip(`${reportTitle(r)} · ${r.range.label}`, 150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: slackEsc(`${r.headline}.`) } },
    { type: "section", fields: fields.slice(0, 10) },
    { type: "section", text: { type: "mrkdwn", text: clip(`*What RankOnGeo did*\n${r.activity.map((a) => `• ${slackEsc(a)}`).join("\n")}`, 2900) } },
  ];
  if (r.articles.published.length) {
    const lines = r.articles.published.slice(0, 10).map((a) => `• ${slackLink(safeUrl(a.url), a.title)}${r.traffic.available && a.url ? ` — ${a.views} view${a.views === 1 ? "" : "s"}` : ""}`);
    blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(`*Articles published (${r.articles.publishedCount})*\n${lines.join("\n")}${r.articles.published.length > 10 ? `\n_…and ${r.articles.published.length - 10} more_` : ""}`, 2900) } });
  }
  if (r.visibility.engines.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(`*AI visibility by engine*\n${r.visibility.engines.map((e) => `• ${slackEsc(e.label)}: *${e.score}%*${e.change ? ` (${signed(e.change)})` : ""}`).join("\n")}`, 2900) } });
  }
  if (r.visibility.topGaps.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(`*Biggest gaps*\n${r.visibility.topGaps.map((g) => `• “${slackEsc(g.prompt)}” — missing from ${slackEsc(g.engines.join(", "))}`).join("\n")}`, 2900) } });
  }
  if (r.articles.upcoming.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(`*Coming up next*\n${r.articles.upcoming.slice(0, 3).map((u) => `• ${slackEsc(u.keyword)}${u.scheduledAt ? ` (about ${shortDate(u.scheduledAt)})` : ""}`).join("\n")}`, 2900) } });
  }
  blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open your dashboard" }, url: dashboardUrl(r) }] });
  return { text: clip(`${reportTitle(r)}: ${r.headline}`, 300), blocks };
}

// ---- Discord ---------------------------------------------------------------

// Escape Markdown, and stop @everyone / @here from pinging anyone.
const dEsc = (s: string) => s.replace(/([\\*_~`|>[\]()])/g, "\\$1").replace(/@/g, "@\u200b");
const dLink = (url: string | null, text: string) => (url ? `[${dEsc(text)}](${url})` : dEsc(text));

export function reportDiscord(r: Report) {
  const color = r.visibility.score === null ? 0x8a7c6d : r.visibility.score >= 60 ? 0x22c55e : r.visibility.score >= 30 ? 0xf59e0b : 0xef4444;
  const field = (name: string, value: string, inline = false) => ({ name: clip(name, 250), value: clip(value || "—", 1000), inline });
  const summary = {
    title: clip(`${reportTitle(r)} · ${r.range.label}`, 250),
    url: dashboardUrl(r),
    description: clip(`${dEsc(r.headline)}.`, 4000),
    color,
    fields: [
      ...kpis(r).map((c) => field(c.label, `**${c.value}**${c.sub ? `\n${dEsc(c.sub)}` : ""}`, true)),
      field("What RankOnGeo did", r.activity.map((a) => `• ${dEsc(a)}`).join("\n")),
    ],
    footer: { text: "RankOnGeo" },
    timestamp: r.generatedAt,
  };
  const details: { title: string; description: string; color: number }[] = [];
  const parts: string[] = [];
  if (r.articles.published.length) {
    parts.push(`**Articles published (${r.articles.publishedCount})**\n${r.articles.published.slice(0, 10).map((a) => `• ${dLink(safeUrl(a.url), a.title)}${r.traffic.available && a.url ? ` — ${a.views} view${a.views === 1 ? "" : "s"}` : ""}`).join("\n")}${r.articles.published.length > 10 ? `\n…and ${r.articles.published.length - 10} more` : ""}`);
  }
  if (r.visibility.engines.length) parts.push(`**AI visibility by engine**\n${r.visibility.engines.map((e) => `• ${dEsc(e.label)}: **${e.score}%**${e.change ? ` (${signed(e.change)})` : ""}`).join("\n")}`);
  if (r.visibility.topGaps.length) parts.push(`**Biggest gaps**\n${r.visibility.topGaps.map((g) => `• “${dEsc(g.prompt)}” — missing from ${dEsc(g.engines.join(", "))}`).join("\n")}`);
  if (r.articles.upcoming.length) parts.push(`**Coming up next**\n${r.articles.upcoming.slice(0, 3).map((u) => `• ${dEsc(u.keyword)}${u.scheduledAt ? ` (about ${shortDate(u.scheduledAt)})` : ""}`).join("\n")}`);
  if (parts.length) details.push({ title: "Details", description: clip(parts.join("\n\n"), 4000), color });
  return { username: "RankOnGeo", allowed_mentions: { parse: [] as string[] }, embeds: [summary, ...details] };
}

// A generic webhook gets the whole report as data.
export function reportWebhook(r: Report) {
  return { event: `${r.period}_report`, report: r };
}
