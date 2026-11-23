// Ведёт запись одного ролика: кадры экрана через CDP screencast, курсор,
// субтитры и отметки времени для дорожки озвучки.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { synthesize } from "./tts.mjs";

const GAP_AFTER_SPEECH = 0.45; // пауза после фразы, с
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const isDry = () => Boolean(process.env.VG_DRY); // прогон без озвучки и кадров — для отладки сценариев

export class Director {
  /** @param {{ page: import("playwright").Page, framesDir: string }} opts */
  constructor({ page, framesDir }) {
    this.page = page;
    this.framesDir = framesDir;
    this.frames = [];
    this.cues = [];
    this.mouse = { x: 800, y: 450 };
    mkdirSync(framesDir, { recursive: true });
  }

  async start() {
    if (isDry()) return;
    this.cdp = await this.page.context().newCDPSession(this.page);
    let n = 0;
    this.cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const file = join(this.framesDir, `f${String(n++).padStart(6, "0")}.jpg`);
      writeFileSync(file, Buffer.from(data, "base64"));
      this.frames.push({ file, ts: metadata.timestamp ?? Date.now() / 1000 });
      this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    await sleep(300);
  }

  async stop() {
    if (isDry()) return { frames: [], cues: [], endTs: Date.now() / 1000 };
    await sleep(600);
    this.endTs = Date.now() / 1000;
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    return { frames: this.frames, cues: this.cues, endTs: this.endTs };
  }

  /** Одна фраза диктора; действие идёт параллельно с речью. */
  async step({ say, caption, do: action, hold = 0 }) {
    const started = Date.now();
    let speech = Promise.resolve();
    if (say && !isDry()) {
      const { file, duration } = await synthesize(say);
      const t = Date.now() / 1000;
      this.cues.push({ file, t, duration, text: caption ?? say });
      await this.caption(caption ?? say);
      speech = sleep((duration + GAP_AFTER_SPEECH) * 1000);
    }
    await Promise.all([speech, action ? action(this) : null]);
    if (hold) await sleep(hold);
    return Date.now() - started;
  }

  async caption(text) {
    await this.page.evaluate((t) => window.__vgCaption?.(t), text).catch(() => {});
  }

  async title(card) {
    await this.page.evaluate((c) => window.__vgTitle?.(c), card);
  }

  async goto(path) {
    await this.page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await sleep(400);
  }

  async wait(ms) {
    await sleep(ms);
  }

  async box(locator) {
    await locator.scrollIntoViewIfNeeded();
    await sleep(250);
    const box = await locator.boundingBox();
    if (!box) throw new Error(`элемент не виден: ${locator}`);
    return box;
  }

  async moveTo(locator, { dx = 0.5, dy = 0.5 } = {}) {
    const b = await this.box(locator);
    await this.movePoint(b.x + b.width * dx, b.y + b.height * dy);
    return b;
  }

  async movePoint(x, y) {
    const dist = Math.hypot(x - this.mouse.x, y - this.mouse.y);
    const steps = Math.max(10, Math.min(45, Math.round(dist / 22)));
    await this.page.mouse.move(x, y, { steps });
    this.mouse = { x, y };
    await sleep(180);
  }

  async click(locator, opts) {
    await this.moveTo(locator, opts);
    await this.page.mouse.down();
    await sleep(70);
    await this.page.mouse.up();
    await sleep(450);
  }

  async clickPoint(x, y) {
    await this.movePoint(x, y);
    await this.page.mouse.down();
    await sleep(70);
    await this.page.mouse.up();
    await sleep(450);
  }

  async type(locator, text, { clear = true, delay = 55 } = {}) {
    await this.click(locator);
    if (clear) await locator.fill("");
    await locator.pressSequentially(text, { delay });
    await sleep(250);
  }

  async select(locator, option) {
    await this.click(locator);
    await locator.selectOption(option);
    await sleep(400);
  }

  async highlight(locator) {
    const b = await this.box(locator);
    await this.page.evaluate((box) => window.__vgHighlight?.(box), b);
    await sleep(350);
  }

  async unhighlight() {
    await this.page.evaluate(() => window.__vgHighlight?.(null)).catch(() => {});
  }

  /** Плавная прокрутка страницы колесом. */
  async scroll(deltaY, { steps = 8 } = {}) {
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, deltaY / steps);
      await sleep(45);
    }
    await sleep(300);
  }

  async scrollTop() {
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(500);
  }
}
