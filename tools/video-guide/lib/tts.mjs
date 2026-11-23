// Озвучка через edge-tts с кэшем на диске: одинаковый текст не синтезируется дважды.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

export const VOICE = process.env.VG_VOICE ?? "ru-RU-SvetlanaNeural";
const RATE = process.env.VG_RATE ?? "+8%";
const EDGE_TTS = process.env.EDGE_TTS ?? "edge-tts";
const CACHE_DIR = join(import.meta.dirname, "..", "cache", "tts");
const RETRIES = 4;
const TTS_TIMEOUT_MS = 40_000;

mkdirSync(CACHE_DIR, { recursive: true });

/**
 * @param {string} text
 * @returns {Promise<{ file: string, duration: number }>}
 */
export async function synthesize(text) {
  const key = createHash("sha1").update(`${VOICE}|${RATE}|${text}`).digest("hex").slice(0, 16);
  const file = join(CACHE_DIR, `${key}.mp3`);
  if (!existsSync(file) || statSync(file).size === 0) {
    const part = `${file}.part`;
    let lastError;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        // Сервис синтеза иногда не отвечает: без таймаута процесс висит бесконечно.
        await run(EDGE_TTS, ["--voice", VOICE, `--rate=${RATE}`, "--text", text, "--write-media", part], {
          timeout: TTS_TIMEOUT_MS,
          killSignal: "SIGKILL",
        });
        renameSync(part, file);
        lastError = undefined;
        break;
      } catch (error) {
        rmSync(part, { force: true });
        lastError = error;
      }
    }
    if (lastError) throw new Error(`edge-tts не смог озвучить «${text.slice(0, 40)}…»: ${lastError.message}`);
  }
  return { file, duration: await mediaDuration(file) };
}

/** Длительность файла в секундах по выводу `ffmpeg -i`. */
export async function mediaDuration(file) {
  const { stderr } = await run(ffmpegPath, ["-hide_banner", "-i", file]).catch((e) => e);
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(stderr));
  if (!m) throw new Error(`не удалось узнать длительность ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Озвучивает все тексты заранее, параллельно небольшими пачками. */
export async function prefetch(texts, concurrency = 4) {
  const queue = [...new Set(texts)];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) await synthesize(queue.shift());
  });
  await Promise.all(workers);
}
