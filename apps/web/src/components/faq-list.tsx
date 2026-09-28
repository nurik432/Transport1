"use client";

import { useMemo, useState } from "react";
import type { FaqBlock, FaqSection } from "@/lib/faq";
import { cx, inputClass } from "./ui";
import { IconChevronRight } from "./icons";

/** Текст ответа одной строкой — по нему ищем. */
function plain(answer: FaqBlock[]): string {
  return answer.map((b) => (typeof b === "string" ? b : b.list.join(" "))).join(" ");
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Сравнение по основе слова, а не по подстроке: «загрузка» должна находить
 * «загрузку» и «загрузки». Короткие слова сравниваем целиком, длинные — по
 * общему началу, допуская расхождение в окончании.
 */
function wordMatches(word: string, token: string): boolean {
  if (token.length <= 3) return word.startsWith(token);
  return commonPrefix(word, token) >= Math.max(4, token.length - 2);
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Совпадение, когда каждое слово запроса нашлось в тексте. */
function matches(text: string, query: string): boolean {
  const haystack = words(text);
  return words(query).every((token) => haystack.some((w) => wordMatches(w, token)));
}

function Answer({ blocks }: { blocks: FaqBlock[] }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4 text-[15px] leading-relaxed text-muted-foreground">
      {blocks.map((block, i) =>
        typeof block === "string" ? (
          <p key={i}>{block}</p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {block.list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/**
 * Список вопросов с поиском. Ответы свёрнуты: экран должен читаться как
 * оглавление, пока человек не нашёл своё. При поиске совпадения раскрыты —
 * иначе пришлось бы открывать их по одному, чтобы понять, то ли это.
 */
export function FaqList({ sections }: { sections: FaqSection[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim();

  const visible = useMemo(() => {
    if (!needle) return sections;
    return sections
      .map((section) => ({
        ...section,
        entries: section.entries.filter((e) => matches(`${e.question} ${plain(e.answer)}`, needle)),
      }))
      .filter((section) => section.entries.length > 0);
  }, [sections, needle]);

  const found = visible.reduce((sum, s) => sum + s.entries.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по вопросам"
          aria-label="Поиск по вопросам"
          className={inputClass}
        />
        {needle ? (
          <p className="px-1 text-[13px] text-muted-foreground" role="status">
            {found === 0 ? "Ничего не нашлось" : `Найдено: ${found}`}
          </p>
        ) : null}
      </div>

      {found === 0 && needle ? (
        <p className="rounded-2xl bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Попробуйте другое слово или обратитесь к администратору.
        </p>
      ) : null}

      {visible.map((section) => (
        <section key={section.id} className="flex flex-col gap-2">
          <h2 className="mx-1 text-[13px] font-semibold text-muted-foreground">{section.title}</h2>
          <div className="flex flex-col overflow-hidden rounded-2xl bg-card">
            {section.entries.map((entry) => (
              <details
                key={entry.id}
                id={entry.id}
                open={Boolean(needle)}
                className="group border-b border-divider last:border-b-0"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 text-[15px] font-semibold">{entry.question}</span>
                  <IconChevronRight
                    className={cx(
                      "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
                      "group-open:rotate-90",
                    )}
                  />
                </summary>
                <Answer blocks={entry.answer} />
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
