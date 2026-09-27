import OpenAI from "openai";
import { serverClient } from "@/lib/supabase";
import { extractH2Headings } from "@/lib/article-headings";

// Generates and stores the images a blog post needs: one cover (used as the
// OG/social image and the post's hero) plus a few inline illustrations spread
// through the body. Used by both RankOnGeo's own marketing blog
// (app/api/admin/blog/generate) and the customer/Autopilot writer
// (lib/article-writer.ts) — same model, same visual style, so every image on
// the site looks like it belongs to the same product.
//
// Every function here degrades to null/[] on any failure instead of
// throwing — a broken image call must never stop an article from being
// written or published.

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-image-1.5";

// Brand palette, as hex (matching the site's oklch tokens — see lib/email.ts,
// which already renders these same colors for email clients that can't do
// oklch): cream background, rust and olive as the only accents, ink-brown
// linework. Keeping every generated image to this palette is what makes them
// read as "ours" rather than generic stock AI art.
const STYLE_SUFFIX =
  ". Minimal flat vector illustration, clean simple geometric shapes, generous negative space, no text, no words, no letters, no logos, no watermarks, no photorealism, no 3D render. Warm cream background (#f6f2e9), rust-orange (#b1552e) and olive-green (#7c8a52) as the only accent colors, ink-brown (#302821) for outlines and linework. Editorial tech-blog illustration style.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The account's image rate limit (5/min, seen in practice) is easy to hit
// when a post's own cover+inline calls land close together, or several posts
// generate around the same time — a plain retry after the limit's own
// window clears it, rather than silently losing an image over a transient
// 429. Any other failure (bad prompt, content policy, network) still gives
// up after one retry.
async function generateImage(concept: string, size: "1536x1024" | "1024x1024"): Promise<Buffer | null> {
  const prompt = `A minimal illustration representing: ${concept.trim().slice(0, 300)}${STYLE_SUFFIX}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await getClient().images.generate({ model: MODEL, prompt, size, quality: "low", n: 1 });
      const b64 = res.data?.[0]?.b64_json;
      return b64 ? Buffer.from(b64, "base64") : null;
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      const message = e instanceof Error ? e.message : String(e);
      if (status === 429 && attempt === 0) {
        const wait = Number(message.match(/try again in (\d+(?:\.\d+)?)s/)?.[1]) || 15;
        console.error("[article-images] rate limited, retrying", { waitSeconds: wait });
        await sleep((wait + 1) * 1000);
        continue;
      }
      console.error("[article-images] generation failed", message);
      return null;
    }
  }
  return null;
}

async function upload(bucket: string, path: string, buffer: Buffer): Promise<string | null> {
  try {
    const db = serverClient();
    const { error } = await db.storage.from(bucket).upload(path, buffer, { contentType: "image/png", upsert: false });
    if (error) {
      console.error("[article-images] upload failed", bucket, path, error.message);
      return null;
    }
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("[article-images] upload threw", e instanceof Error ? e.message : e);
    return null;
  }
}

function pathSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "article";
}

// One 16:9 hero image for the post's cover/OG image. Returns null (never
// throws) if generation or upload fails — callers fall back to the site's
// existing generated-SVG cover art or default OG image.
export async function generateCoverImage(bucket: string, slugHint: string, topic: string): Promise<string | null> {
  const buffer = await generateImage(topic, "1536x1024");
  if (!buffer) return null;
  return upload(bucket, `${pathSlug(slugHint)}-cover-${Date.now()}.png`, buffer);
}

export type InlineImage = { heading: string; url: string };

// One square-ish image per chosen H2, evenly spread through the article
// rather than front-loaded — spacing images out is what makes a long post
// feel illustrated throughout instead of just having a header graphic.
// Skipped entirely on short articles (fewer than 4 H2s): a couple of
// interstitial images in a short post reads as padding, not illustration.
// FAQ and the conclusion are structural wrappers, not a substantive idea to
// illustrate — pick from the real content sections instead, and only fall
// back to the full list if a short article turns out to be mostly those.
// Pure (no I/O) so the selection itself — which headings, in what order —
// can be tested without a real image call.
export function isBoilerplateHeading(h: string): boolean {
  return /^(faq|frequently asked questions|conclusion|summary|takeaways?|final thoughts?|wrapping up)\b/i.test(h.trim());
}

export function pickHeadingsForImages(allHeadings: string[], max: number): string[] {
  if (allHeadings.length < 4) return [];
  const content = allHeadings.filter((h) => !isBoilerplateHeading(h));
  const headings = content.length >= 2 ? content : allHeadings;
  const step = headings.length / (max + 1);
  return Array.from({ length: max }, (_, i) => headings[Math.min(headings.length - 1, Math.round(step * (i + 1)))]);
}

// One heading, generated and uploaded. Exported on its own (not just inlined
// in generateInlineImages) so a specific missing image can be filled in later
// without regenerating a whole article's set — e.g. topping up a post that
// came up short from a transient rate limit.
export async function generateOneInlineImage(bucket: string, slugHint: string, heading: string, index: number): Promise<InlineImage | null> {
  const buffer = await generateImage(heading, "1024x1024");
  if (!buffer) return null;
  const url = await upload(bucket, `${pathSlug(slugHint)}-inline-${index}-${Date.now()}.png`, buffer);
  return url ? { heading, url } : null;
}

export async function generateInlineImages(bucket: string, slugHint: string, markdown: string, max = 3): Promise<InlineImage[]> {
  const chosen = pickHeadingsForImages(extractH2Headings(markdown), max);
  if (!chosen.length) return [];

  const results = await Promise.all(chosen.map((heading, i) => generateOneInlineImage(bucket, slugHint, heading, i)));
  return results.filter((r): r is InlineImage => r !== null);
}

// Splices each inline image directly under its H2 heading (before the rest
// of that section's text), as a markdown image with the heading as alt text.
// Headings not found (shouldn't happen — they came from this same markdown)
// are silently skipped rather than erroring.
export function insertInlineImages(markdown: string, images: InlineImage[]): string {
  let out = markdown;
  for (const img of images) {
    const marker = `## ${img.heading}`;
    const at = out.indexOf(marker);
    if (at < 0) continue;
    const lineEnd = out.indexOf("\n", at);
    const insertAt = lineEnd < 0 ? out.length : lineEnd + 1;
    out = `${out.slice(0, insertAt)}\n![${img.heading}](${img.url})\n${out.slice(insertAt)}`;
  }
  return out;
}

// Generates a cover plus a few inline images for a finished article and
// splices the inline ones into the body — the one call site both writers use.
// Cover and inline generation run in parallel since they're independent API
// calls; any failure anywhere still returns a usable article (coverImageUrl
// null, or fewer/no inline images) rather than throwing.
export async function illustrateArticle(bucket: string, slugHint: string, written: { article: string; title: string }): Promise<{ article: string; coverImageUrl: string | null }> {
  const [coverImageUrl, inlineImages] = await Promise.all([
    generateCoverImage(bucket, slugHint, written.title),
    generateInlineImages(bucket, slugHint, written.article),
  ]);
  const article = inlineImages.length ? insertInlineImages(written.article, inlineImages) : written.article;
  return { article, coverImageUrl };
}
