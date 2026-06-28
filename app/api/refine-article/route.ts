import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { content, title, instruction } = await req.json();

  if (!content || !instruction) {
    return NextResponse.json({ error: "content and instruction are required" }, { status: 400 });
  }

  const prompt = `You are an expert content editor. Apply the following instruction to the article below. Return the complete modified article in the same markdown format, preserving structure and quality. Keep the H1 title at the top unless specifically instructed to change it.

Instruction: ${instruction}

Article to edit:
${content}

Return only the modified article markdown, no commentary or preamble.`;

  const msg = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const refined = (msg.content[0] as { type: string; text: string }).text.trim();
  const titleMatch = refined.match(/^#\s+(.+)/m);
  const refinedTitle = titleMatch ? titleMatch[1].trim() : title;
  const wordCount = refined.split(/\s+/).filter(Boolean).length;

  return NextResponse.json({ article: refined, title: refinedTitle, wordCount });
}
