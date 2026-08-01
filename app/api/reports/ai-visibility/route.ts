import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";
import { renderPdf } from "@/lib/browser-scanner";

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google: "Google AI",
  grok: "Grok",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function reportHtml(opts: {
  brandName: string;
  domain: string;
  generatedAt: string;
  overallScore: number;
  promptCount: number;
  scores: { engine: string; score: number; mentionCount: number; totalPrompts: number; avgRank: number | null }[];
}): string {
  const rows = opts.scores
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(ENGINE_LABELS[s.engine] ?? s.engine)}</td>
        <td class="num">${s.score}%</td>
        <td class="num">${s.mentionCount}/${s.totalPrompts}</td>
        <td class="num">${s.avgRank ?? "—"}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, serif; color: #302821; margin: 0; padding: 48px 56px; }
  .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #b1552e; text-transform: uppercase; }
  h1 { font-family: Georgia, serif; font-weight: 400; font-size: 34px; margin: 8px 0 4px; }
  .sub { font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #6f6257; margin: 0 0 32px; }
  .score-box { display: flex; align-items: center; gap: 24px; border: 1px solid #e4ddd0; border-radius: 16px; padding: 28px 32px; margin-bottom: 32px; }
  .score-value { font-size: 48px; font-weight: 700; color: #302821; }
  .score-label { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #6f6257; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 13px; }
  th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #302821; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6f6257; }
  td { padding: 10px 8px; border-bottom: 1px solid #e4ddd0; }
  td.num, th.num { text-align: right; }
  .footer { margin-top: 40px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #a89d8e; }
</style>
</head>
<body>
  <div class="brand">RankOnGeo &middot; AI Visibility Report</div>
  <h1>${escapeHtml(opts.brandName)}</h1>
  <p class="sub">${escapeHtml(opts.domain)} &middot; generated ${escapeHtml(opts.generatedAt)}</p>

  <div class="score-box">
    <div class="score-value">${opts.overallScore}%</div>
    <div>
      <div class="score-label">Composite visibility</div>
      <div class="sub" style="margin:4px 0 0;">Across ${opts.scores.length} AI engine${opts.scores.length === 1 ? "" : "s"} &middot; ${opts.promptCount} tracked prompts</div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Engine</th><th class="num">Visibility</th><th class="num">Mentions</th><th class="num">Avg. rank</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">RankOnGeo &middot; rankongeo.com</div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId, "id, name, domain");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  if (await requiresPaywall(db, access.ownerId)) {
    return NextResponse.json({ error: "Upgrade your plan to download the visibility report", upgradeRequired: true }, { status: 402 });
  }

  const brand = access.brand as unknown as { name: string; domain: string };

  const { data: latestRun } = await db
    .from("scan_runs")
    .select("id, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!latestRun) return NextResponse.json({ error: "No scan data yet" }, { status: 404 });

  const [{ data: scoreRows }, { count: promptCount }] = await Promise.all([
    db.from("visibility_scores")
      .select("engine, score, mention_count, total_prompts, avg_rank")
      .eq("scan_run_id", latestRun.id),
    db.from("tracked_prompts").select("id", { count: "exact", head: true }).eq("brand_id", brandId).neq("status", "paused"),
  ]);

  const scores = (scoreRows ?? []).map((s) => ({
    engine: s.engine,
    score: s.score,
    mentionCount: s.mention_count,
    totalPrompts: s.total_prompts,
    avgRank: s.avg_rank,
  }));
  if (!scores.length) return NextResponse.json({ error: "No scan data yet" }, { status: 404 });

  const overallScore = Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length);
  const generatedAt = new Date().toISOString().slice(0, 10);

  const html = reportHtml({
    brandName: brand.name,
    domain: brand.domain,
    generatedAt,
    overallScore,
    promptCount: promptCount ?? 0,
    scores,
  });

  const pdf = await renderPdf(html);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${brand.domain.replace(/[^a-z0-9.-]/gi, "_")}-ai-visibility-${generatedAt}.pdf"`,
    },
  });
}
