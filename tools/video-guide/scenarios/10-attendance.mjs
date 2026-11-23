// Табель водителей: месяц, день, графики работы, точки сканирования.
import { openSection } from "../lib/ui.mjs";

export default {
  title: "Табель водителей",
  subtitle: "Отметки по QR-коду, графики работы и выгрузка в Excel",
  start: "/admin",
  intro: "Табель считает рабочие дни водителей. Водитель сканирует QR-код на проходной утром и вечером, а система сверяет отметки с его графиком работы.",
  steps: [
    {
      say: "Откройте «Анализ», «Табель». Строки — водители, столбцы — дни месяца. Серым отмечены выходные по графику водителя.",
      do: async (d) => {
        await openSection(d, "Табель");
        await d.highlight(d.page.getByRole("rowheader").first());
      },
    },
    {
      say: "Буквы в клетках: «Я» — полный день, «Н» — неполный, «НН» — не отработал, «О» — отпуск, «Б» — больничный, «В» — выходной. Расшифровка есть над таблицей.",
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(d.page.getByText(/Я — полный день/));
      },
    },
    {
      say: "Справа — итоги месяца: норма по графику, полные и неполные дни, пропуски, отпуска и больничные.",
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(d.page.getByRole("columnheader", { name: "Норма" }));
      },
    },
    {
      say: "Нажмите на клетку дня: откроются отметки водителя за этот день. Здесь же можно поставить отпуск или больничный и поправить день — с указанием причины, все правки сохраняются в истории.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole("button", { name: /, 18 ноября: / }).first());
        await d.wait(1500);
      },
    },
    {
      say: "Закроем окно. Кнопка «Скачать XLSX» выгружает табель за месяц в Excel.",
      do: async (d) => {
        await d.page.keyboard.press("Escape");
        await d.wait(600);
        await d.highlight(d.page.getByRole("link", { name: "Скачать XLSX" }));
      },
    },
    {
      say: "«Графики работы» — справочник графиков. Пять через два, шесть через один, сменные два через два. График без назначения действует для всех водителей по умолчанию.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole("link", { name: "Графики работы" }));
        await d.page.waitForLoadState("networkidle").catch(() => {});
        await d.wait(800);
      },
    },
    {
      say: "Новый график создаётся кнопкой «Создать график»: название, тип и рабочие дни недели. Ниже сразу видно, что получится.",
      do: async (d) => {
        await d.click(d.page.getByRole("button", { name: /Создать график/ }));
        await d.type(d.page.getByRole("textbox", { name: /^Название/ }), "6/1 (пн–сб)");
        await d.click(d.page.getByRole("button", { name: "Сб", exact: true }));
        await d.highlight(d.page.getByText(/Получится:/));
      },
    },
    {
      say: "Нажимаем «Создать график». Назначить график водителю можно на странице графика или кликом по графику под именем водителя в табеле. Изменения задним числом требуют причины.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole("button", { name: "Создать график", exact: true }));
        await d.wait(1300);
      },
    },
    {
      say: "Вернёмся к табелю и откроем «Точки сканирования».",
      do: async (d) => {
        await openSection(d, "Табель");
        await d.click(d.page.getByRole("link", { name: "Точки сканирования" }));
        await d.page.waitForLoadState("networkidle").catch(() => {});
        await d.wait(800);
      },
    },
    {
      say: "Точка — это печатный QR-код на проходной. Отметка засчитывается, только если водитель стоит в радиусе точки. «Печать QR» открывает лист для печати, «Перевыпустить QR» делает старый код недействительным.",
      do: async (d) => {
        await d.highlight(d.page.getByRole("row").nth(1));
        await d.wait(1500);
        await d.unhighlight();
        await d.moveTo(d.page.getByRole("link", { name: "Печать QR" }).first());
        await d.wait(800);
        await d.moveTo(d.page.getByRole("button", { name: "Перевыпустить QR" }).first());
      },
    },
  ],
  outro: "Вот и всё про табель. Ответы на частые вопросы есть в разделе «Вопросы и ответы» в самой панели.",
  outroCard: "Остальные вопросы — в разделе «Вопросы и ответы»",
};
