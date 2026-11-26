// Разведка: снимает aria-дерево страниц админки, чтобы писать сценарии по реальной разметке.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const pages = process.argv.slice(2);
mkdirSync("explore", { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${BASE}/login`);
await page.getByRole("textbox").first().fill(process.env.DEMO_LOGIN);
await page.locator('input[type="password"]').fill(process.env.DEMO_PASSWORD);
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForURL("**/admin");

for (const p of pages) {
  await page.goto(`${BASE}${p}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  const snap = await page.locator("body").ariaSnapshot();
  const name = p.replace(/[\/?=&]/g, "_") || "_root";
  writeFileSync(`explore/${name}.txt`, snap);
  console.log(p, snap.length);
}
await browser.close();
