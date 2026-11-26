// Склеивает кадры screencast и фразы диктора в MP4 (H.264 + AAC) и пишет SRT рядом.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const FPS = 30;
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * @param {{ frames: {file:string, ts:number}[], cues: {file:string, t:number, duration:number, text:string}[], endTs:number }} rec
 * @param {{ workDir: string, out: string }} opts
 */
export async function assemble(rec, { workDir, out }) {
  const { frames, cues, endTs } = rec;
  if (frames.length === 0) throw new Error("нет ни одного кадра");
  const t0 = frames[0].ts;

  const total = endTs - t0;
  const listFile = join(workDir, "frames.txt");
  writeFileSync(listFile, frameList(frames, t0, total));

  const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile];
  cues.forEach((c) => args.push("-i", c.file));
  const filters = [`[0:v]scale=1920:1080:flags=lanczos,fps=${FPS},format=yuv420p[v]`];
  if (cues.length) {
    cues.forEach((c, i) => {
      const ms = Math.max(0, Math.round((c.t - t0) * 1000));
      filters.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`);
    });
    filters.push(`${cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,apad[a]`);
  } else {
    filters.push(`anullsrc=r=48000:cl=stereo[a]`);
  }
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ac", "2",
    "-movflags", "+faststart",
    out,
  );
  await run(ffmpegPath, args, { maxBuffer: MAX_BUFFER });
  writeFileSync(out.replace(/\.mp4$/, ".srt"), toSrt(cues, t0));
  return { duration: total };
}

/**
 * Раскладывает кадры по сетке FPS: в каждый момент k/FPS показывается последний
 * кадр, снятый к этому времени. Кадры приходят неравномерно (при движении мыши
 * чаще 30 в секунду, на статичной странице — редко), поэтому длительность берётся
 * из сетки, а не из разницы соседних кадров, — иначе видеоряд растягивается
 * и расходится с озвучкой.
 */
function frameList(frames, t0, total) {
  const ticks = Math.ceil(total * FPS);
  const runs = [];
  let i = 0;
  for (let k = 0; k < ticks; k++) {
    const t = t0 + k / FPS;
    while (i + 1 < frames.length && frames[i + 1].ts <= t) i++;
    const last = runs.at(-1);
    if (last && last.index === i) last.count++;
    else runs.push({ index: i, count: 1 });
  }
  const lines = [];
  for (const r of runs) {
    lines.push(`file '${frames[r.index].file.replaceAll("\\", "/")}'`, `duration ${(r.count / FPS).toFixed(5)}`);
  }
  lines.push(`file '${frames[runs.at(-1).index].file.replaceAll("\\", "/")}'`);
  return lines.join("\n");
}

function toSrt(cues, t0) {
  const stamp = (s) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
    const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cues
    .filter((c) => c.text)
    .map((c, i) => `${i + 1}\n${stamp(c.t - t0)} --> ${stamp(c.t - t0 + c.duration + 0.3)}\n${c.text}\n`)
    .join("\n");
}
