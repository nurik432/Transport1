// Записывает видеоинструкции. Запуск: node record.mjs [номер-или-id ...]
// Без аргументов записывает все сценарии из scenarios/.
import { chromium } from "playwright";
import { readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { OVERLAY_SCRIPT } from "./lib/overlay.js";
import { Director } from "./lib/director.mjs";
import { prefetch } from "./lib/tts.mjs";
import { assemble } from "./lib/assemble.mjs";
import { stageLive } from "./lib/stage.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const LOGIN = process.env.DEMO_LOGIN;
const PASSWORD = process.env.DEMO_PASSWORD;
if (!LOGIN || !PASSWORD) throw new Error("Задайте DEMO_LOGIN и DEMO_PASSWORD (демо-админ из seed)");

const ROOT = import.meta.dirname;
const OUT_DIR = join(ROOT, "out");
const VIEWPORT = { width: 1600, height: 900 };
const SCALE = 1.2; // 1600×900 CSS-пикселей → кадр 1920×1080

if (process.argv.includes("--dry")) process.env.VG_DRY = "1";
const files = readdirSync(join(ROOT, "scenarios")).filter((f) => f.endsWith(".mjs")).sort();
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const selected = files.filter((f) => wanted.length === 0 || wanted.some((w) => f.startsWith(w) || f.includes(w)));
if (selected.length === 0) throw new Error(`нет сценариев под «${wanted.join(" ")}»`);

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ channel: process.env.VG_CHANNEL ?? "msedge" });

let stopLive = async () => {};
try {
  const storageState = await loginState();
  if (!process.env.VG_NO_STAGE) {
    stopLive = await stageLive({
      browser,
      base: BASE,
      databaseUrl: required("DATABASE_URL"),
      driverPassword: required("DEMO_DRIVER_PASSWORD"),
    });
  }
  const failed = [];
  for (const f of selected) {
    const { default: scenario } = await import(pathToFileURL(join(ROOT, "scenarios", f)).href);
    try {
      await recordOne(scenario, f.replace(/\.mjs$/, ""), storageState);
    } catch (error) {
      failed.push(f);
      console.error(`\n✖ ${f}: ${error.message.split("\n")[0]}`);
    }
  }
  if (failed.length) {
    process.exitCode = 1;
    console.error(`Не записаны: ${failed.join(", ")}`);
  }
} finally {
  await stopLive();
  await browser.close();
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}

async function loginState() {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await signIn(page);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

export async function signIn(page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="tel"]').fill(LOGIN);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/admin");
}

async function recordOne(scenario, name, storageState) {
  const texts = [scenario.intro, scenario.outro, ...scenario.steps.map((s) => s.say)].filter(Boolean);
  process.stdout.write(`▶ ${name}: озвучка ${texts.length} фраз… `);
  if (!process.env.VG_DRY) await prefetch(texts);

  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    storageState: scenario.loggedOut ? undefined : storageState,
    locale: "ru-RU",
    timezoneId: "Asia/Dushanbe",
  });
  await ctx.addInitScript(OVERLAY_SCRIPT);
  const page = await ctx.newPage();
  if (scenario.setup) await scenario.setup({ base: BASE });

  const work = join(ROOT, "cache", "frames", name);
  rmSync(work, { recursive: true, force: true });
  const d = new Director({ page, framesDir: work });

  await d.goto(scenario.start ?? "/admin");
  const card = { kicker: scenario.kicker ?? "Инструкция администратора", title: scenario.title, subtitle: scenario.subtitle };
  await d.title(card);
  await d.start();
  let rec;
  try {
    if (scenario.intro) await d.step({ say: scenario.intro, caption: "" });
    await d.title(null);
    await d.caption("");
    for (const [i, s] of scenario.steps.entries()) {
      try {
        await d.step(s);
      } catch (error) {
        throw new Error(`шаг ${i + 1} («${(s.say ?? "").slice(0, 50)}»): ${error.message}`);
      }
    }
    await d.unhighlight();
    if (scenario.outro) {
      await d.caption("");
      await d.title({ kicker: "Готово", title: scenario.title, subtitle: scenario.outroCard ?? "" });
      await d.step({ say: scenario.outro, caption: "" });
    }
  } finally {
    rec = await d.stop();
    await ctx.close();
  }
  if (process.env.VG_DRY) {
    console.log("сухой прогон пройден");
    return;
  }
  writeFileSync(join(work, "recording.json"), JSON.stringify(rec)); // для пересборки без перезаписи
  const out = join(OUT_DIR, `${name}.mp4`);
  const { duration } = await assemble(rec, { workDir: work, out });
  console.log(`готово: ${out} (${Math.round(duration)} с, ${rec.frames.length} кадров)`);
}
