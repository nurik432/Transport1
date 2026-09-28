/**
 * Собирает docs/03-faq.md из apps/web/src/lib/faq.ts.
 *
 * Один источник на приложение и документ: правится только faq.ts, документ
 * пересобирается. Запуск:
 *
 *   pnpm docs:faq          пересобрать документ
 *   pnpm docs:faq:check    проверить, что документ не отстал (для CI)
 *
 * Запускается родным Node (v22.18+ / v24): типы снимаются на лету, отдельная
 * зависимость для этого не нужна.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { FAQ, type FaqBlock, type FaqRole, type FaqSection } from "../apps/web/src/lib/faq.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DOC = resolve(here, "..", "docs", "03-faq.md");

const ROLE_LABEL: Record<FaqRole, string> = {
  passenger: "пассажиров",
  driver: "водителей",
  admin: "администраторов",
};

/** Кому адресован раздел: всем ролям сразу или одной. */
function audience(section: FaqSection): string {
  const roles = new Set<FaqRole>(section.entries.flatMap((e) => e.roles));
  if (roles.size === 3) return "Для всех";
  return `Для ${[...roles].map((r) => ROLE_LABEL[r]).join(" и ")}`;
}

/**
 * Якорь так, как его строит GitHub: нижний регистр, пунктуация убрана,
 * каждый пробел превращается в дефис (двойной пробел — в два дефиса).
 */
function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/ /g, "-");
}

function renderAnswer(blocks: FaqBlock[]): string {
  return blocks
    .map((block) =>
      typeof block === "string" ? block : block.list.map((item) => `- ${item}`).join("\n"),
    )
    .join("\n\n");
}

function render(): string {
  const lines: string[] = [];

  lines.push("# Частые вопросы");
  lines.push("");
  lines.push("<!-- Файл собирается из apps/web/src/lib/faq.ts. Правьте его, затем");
  lines.push("     выполните `pnpm docs:faq`. Правки прямо здесь будут потеряны. -->");
  lines.push("");
  lines.push("Ответы на то, что спрашивают чаще всего.");
  lines.push("");
  lines.push("Эти же ответы есть внутри приложения, с поиском и только для своей роли:");
  lines.push("`/app/help` у пассажира, `/driver/help` у водителя, `/admin/help` у");
  lines.push("администратора.");
  lines.push("");
  lines.push("Подробное описание экранов — в [руководстве пользователя](02-user-guide.md).");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Содержание");
  lines.push("");

  for (const section of FAQ) {
    lines.push(`**${section.title}** · ${audience(section)}`);
    lines.push("");
    for (const entry of section.entries) {
      lines.push(`- [${entry.question}](#${anchor(entry.question)})`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  for (const section of FAQ) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(`_${audience(section)}._`);
    lines.push("");
    for (const entry of section.entries) {
      lines.push(`### ${entry.question}`);
      lines.push("");
      lines.push(renderAnswer(entry.answer));
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("Не нашли свой вопрос — смотрите [руководство пользователя](02-user-guide.md):");
  lines.push("там каждый экран разобран по частям.");
  lines.push("");

  return lines.join("\n");
}

function main(): void {
  const next = render();
  const check = process.argv.includes("--check");

  if (check) {
    let current = "";
    try {
      current = readFileSync(DOC, "utf8");
    } catch {
      console.error("docs/03-faq.md отсутствует. Выполните: pnpm docs:faq");
      process.exit(1);
    }
    // Рабочая копия может быть с CRLF — сравниваем по содержанию, не по концам строк.
    if (current.replace(/\r\n/g, "\n") !== next) {
      console.error("docs/03-faq.md отстал от apps/web/src/lib/faq.ts. Выполните: pnpm docs:faq");
      process.exit(1);
    }
    console.log("docs/03-faq.md актуален");
    return;
  }

  writeFileSync(DOC, next, "utf8");
  const count = FAQ.reduce((sum, s) => sum + s.entries.length, 0);
  console.log(`docs/03-faq.md собран: разделов ${FAQ.length}, вопросов ${count}`);
}

main();
