/**
 * PDF rendering via a warm Chromium pool (Playwright). Playwright is an
 * optional dependency: HTML composition works without it, and PDF rendering
 * surfaces a clear install hint when the engine/browsers are not present.
 *
 * This mirrors the production architecture (warm browser reuse) at a single-
 * process scale; the server can later swap this for a worker pool / Gotenberg.
 */

export interface PdfOptions {
  format?: "A4" | "Letter" | "Legal" | "A3" | "A5" | "Tabloid" | "Ledger";
  landscape?: boolean;
  printBackground?: boolean;
}

let browserPromise: Promise<unknown> | null = null;

async function getBrowser(): Promise<{ newPage: () => Promise<PlaywrightPage> }> {
  if (!browserPromise) {
    browserPromise = (async () => {
      let chromium: PlaywrightChromium;
      try {
        ({ chromium } = (await import("playwright")) as unknown as { chromium: PlaywrightChromium });
      } catch {
        throw new PdfUnavailableError(
          "PDF rendering requires Playwright. Install it with:\n  npm i -w @lw-text/project playwright\n  npx playwright install chromium",
        );
      }
      try {
        return await chromium.launch({
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
          timeout: 20_000,
        });
      } catch (e) {
        browserPromise = null;
        throw new PdfUnavailableError(
          `Could not launch Chromium. Run "npx playwright install chromium".\n${(e as Error).message}`,
        );
      }
    })();
  }
  return browserPromise as Promise<{ newPage: () => Promise<PlaywrightPage> }>;
}

export class PdfUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfUnavailableError";
  }
}

/** Render a full HTML document to a PDF buffer. */
export async function renderPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    return await page.pdf({
      format: opts.format ?? "A4",
      landscape: opts.landscape ?? false,
      printBackground: opts.printBackground ?? true,
    });
  } finally {
    await page.close();
  }
}

export async function closePdfEngine(): Promise<void> {
  if (browserPromise) {
    const browser = (await browserPromise) as { close?: () => Promise<void> };
    await browser.close?.();
    browserPromise = null;
  }
}

/* Minimal structural types so we don't hard-depend on Playwright's types. */
interface PlaywrightChromium {
  launch(opts?: { args?: string[]; timeout?: number }): Promise<{
    newPage: () => Promise<PlaywrightPage>;
    close?: () => Promise<void>;
  }>;
}
interface PlaywrightPage {
  setContent(html: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>;
  pdf(opts?: Record<string, unknown>): Promise<Buffer>;
  close(): Promise<void>;
}
