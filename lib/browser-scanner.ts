import { Browser, BrowserContext, chromium } from "playwright";

// Singleton browser process — shared across all requests (cheap to reuse).
// Each scan gets its own BrowserContext (isolated cookies, storage, session)
// so concurrent scans for different clients never interfere with each other.
let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;

  const token = process.env.BROWSERLESS_TOKEN;
  if (token) {
    _browser = await chromium.connect(
      `wss://production-sfo.browserless.io?token=${token}&timeout=60000`
    );
  } else {
    _browser = await chromium.launch({ headless: true });
  }

  return _browser;
}

async function newContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  return browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    // Each context is a fully isolated incognito session —
    // separate cookies, localStorage, and cache from every other scan.
  });
}

export async function scanPerplexity(query: string): Promise<string> {
  const ctx = await newContext();

  try {
    const page = await ctx.newPage();
    await page.goto("https://www.perplexity.ai", { waitUntil: "domcontentloaded", timeout: 20000 });

    // Dismiss cookie dialog if it appears
    const gotIt = page.getByRole("button", { name: "Got it" });
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Type query and submit
    await page.locator("#ask-input").waitFor({ timeout: 10000 });
    await page.locator("#ask-input").fill(query);
    await page.locator("#ask-input").press("Enter");

    // Wait for response — sources button appears when streaming finishes
    await page.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.some((b) => /\d+\s+source/i.test(b.textContent ?? ""));
      },
      { timeout: 40000 }
    );

    await page.waitForTimeout(1000);

    const text = await page.evaluate(() => {
      const tabpanel = document.querySelector('[role="tabpanel"]');
      const root = tabpanel ?? document;
      return Array.from(root.querySelectorAll("p, li"))
        .map((el) => (el as HTMLElement).innerText?.trim())
        .filter((t) => t && t.length > 15)
        .join("\n");
    });

    return text;
  } finally {
    await ctx.close(); // closes all pages in this context and wipes its session
  }
}

export async function scanGoogleAIMode(query: string): Promise<string> {
  const ctx = await newContext();

  try {
    const page = await ctx.newPage();
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=50`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

    // "AI Mode response is ready" appears in the DOM when the response finishes streaming
    await page.waitForFunction(
      () => document.body.innerText.includes("AI Mode response is ready"),
      { timeout: 40000 }
    );

    await page.waitForTimeout(1500);

    const text = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("p, li, h3"))
        .map((el) => (el as HTMLElement).innerText?.trim())
        .filter((t) => t && t.length > 20)
        .slice(0, 40)
        .join("\n");
    });

    return text;
  } finally {
    await ctx.close();
  }
}
