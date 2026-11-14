// Quick browser smoke test against a running dev server (uses the installed Chrome).
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3210";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const shotDir = process.env.SHOT_DIR ?? ".";

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

await page.goto(BASE + "/");
await page.getByRole("button", { name: "New song" }).first().click();
await page.getByLabel("Title").fill("Smoke Test Song");
await page.getByRole("button", { name: "Create song" }).click();
await page.waitForURL(/\/studio\/.+\/lyrics/);
await page.waitForSelector("[data-line-input]");
const first = page.locator("[data-line-input]").first();
await first.click();
await first.fill("ฉันยังคิดถึงเธอทุกคืน");
await first.press("Enter");
await page.keyboard.type("อุดรออนซอนสะออนใจ");
await page.keyboard.press("Enter");
await page.keyboard.type("my heart is breaking apart");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${shotDir}/lyrics.png` });
const url = page.url();
const pid = url.split("/studio/")[1].split("/")[0];
await page.goto(`${BASE}/studio/${pid}/piano-roll`);
await page.waitForSelector("[aria-label='Piano roll note editor']");
await page.waitForTimeout(500);
await page.screenshot({ path: `${shotDir}/piano-roll.png` });
console.log("project", pid);
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
