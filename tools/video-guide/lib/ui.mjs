// Общие локаторы админки для сценариев.

/** Пункт левого меню. Имя ищется по началу: у «Дашборда» в названии ещё счётчик. */
export const nav = (page, name) =>
  page.getByRole("navigation", { name: "Разделы администратора" }).getByRole("link", { name: new RegExp(`^${name}`) });

export const main = (page) => page.locator("main");

/** Переход по пункту меню с видимым движением курсора. */
export async function openSection(d, name) {
  await d.click(nav(d.page, name));
  await d.page.waitForLoadState("load");
  await d.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await d.wait(500);
}

/** Строка таблицы, в тексте которой есть все подстроки. */
export const row = (page, ...parts) => {
  let loc = page.getByRole("row");
  for (const p of parts) loc = loc.filter({ hasText: p });
  return loc.first();
};
