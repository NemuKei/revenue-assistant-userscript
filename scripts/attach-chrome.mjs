import { chromium } from "playwright-core";

const endpoint = process.env.CHROME_CDP_URL ?? "http://127.0.0.1:9222";
const targetUrl = process.argv[2];

const browser = await chromium.connectOverCDP(endpoint);

try {
    const context = browser.contexts()[0];

    if (!context) {
        throw new Error("Chrome のコンテキストが見つかりません。chrome:debug で起動し直してください。");
    }

    if (targetUrl) {
        const page = await context.newPage();
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    }

    const pages = context.pages();

    if (pages.length === 0) {
        console.log("open pages: none");
    }

    for (const [index, page] of pages.entries()) {
        let title = "(no title)";

        try {
            title = await page.title();
        } catch {
            title = "(title unavailable)";
        }

        console.log(`${index}: ${title} | ${page.url()}`);
    }
} finally {
    await browser.close();
}
