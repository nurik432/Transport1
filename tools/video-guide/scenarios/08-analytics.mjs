// Аналитика загрузки и прогноз.
import { openSection } from "../lib/ui.mjs";

const h2 = (page, name) => page.getByRole("heading", { name, level: 2 });

export default {
  title: "Аналитика и прогноз",
  subtitle: "Раз в неделю: где тесно, где пусто и что поменять в расписании",
  start: "/admin",
  intro: "Аналитика отвечает на вопрос, хватает ли мест. Загрузка рейса — это большее из двух чисел: сколько записалось и сколько реально ехало, — делённое на число мест в машине.",
  steps: [
    {
      say: "Откройте «Анализ», «Аналитика». Сначала — сравнение всех маршрутов: средняя и максимальная загрузка, сколько рейсов было перегружено и статус.",
      do: async (d) => {
        await openSection(d, "Аналитика");
        await d.highlight(d.page.getByRole("table").first());
      },
    },
    {
      say: "Период переключается: неделя, две недели или тридцать дней.",
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(d.page.getByRole("link", { name: "2 недели" }).locator(".."));
      },
    },
    {
      say: "Нажмите на номер маршрута, чтобы открыть его разбор.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole("link", { name: "№1" }).first());
        await d.page.waitForLoadState("networkidle").catch(() => {});
        await d.wait(900);
      },
    },
    {
      say: "Чипы с временем — это отправления маршрута с их средней загрузкой. Выберите отправление, и весь экран перестроится под него.",
      do: async (d) => {
        await d.highlight(d.page.getByRole("link", { name: /^07:30/ }).locator(".."));
        await d.wait(1000);
        await d.unhighlight();
        await d.click(d.page.getByRole("link", { name: /^07:00/ }));
        await d.page.waitForLoadState("networkidle").catch(() => {});
        await d.wait(800);
      },
    },
    {
      say: "График по дням: столбцы — загрузка, пунктир — вместимость. Смотрите не на высоту, а на то, как часто столбцы выходят выше линии.",
      do: async (d) => {
        await d.highlight(d.page.getByRole("img", { name: /Загрузка по дням/ }));
      },
    },
    {
      say: "Блок «Где садятся» показывает, на каких остановках набирается этот рейс.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(d.page.locator("main").getByText(/Где садятся/).first());
      },
    },
    {
      say: "Тёмный блок «Что можно сделать» — вывод словами и кнопка. Если рейс переполнен, система предложит добавить отправление пораньше и откроет расписание с уже подставленным временем.",
      do: async (d) => {
        await d.highlight(d.page.locator("main").getByText("Что можно сделать", { exact: true }).locator(".."));
      },
    },
    {
      say: "Ниже — загрузка по времени отправления, по дням недели и по остановкам, и список всех рейсов за период.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(h2(d.page, "Загрузка по времени отправления"));
        await d.wait(900);
        await d.moveTo(h2(d.page, "Загрузка по остановкам · все рейсы"));
      },
    },
    {
      say: "Теперь «Прогноз». Это взгляд на неделю вперёд по истории за двадцать восемь дней.",
      do: async (d) => {
        await openSection(d, "Прогноз");
      },
    },
    {
      say: "Пять цифр сверху: маршруты под риском, рейсы, где не хватит мест, группы проживания сотрудников, кто живёт далеко от остановок и у кого не указан адрес.",
      do: async (d) => {
        await d.highlight(d.page.locator("main").getByText(/Маршрутов под риском/).first().locator(".."));
      },
    },
    {
      say: "Прогноз спроса по маршрутам: на каждый день и отправление — сколько людей ожидается, сколько мест и риск. В колонке «Основание» видно, на скольких рейсах построен прогноз и насколько он точен.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(h2(d.page, "Прогноз спроса по маршрутам"));
        await d.highlight(d.page.getByRole("cell", { name: "Основание", exact: true }).first());
      },
    },
    {
      say: "Ниже — карта «Где живут сотрудники» и предложения: черновики новых маршрутов для групп, рядом с которыми нет остановки. Решение всегда принимает администратор — система только показывает данные.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(h2(d.page, "Где живут сотрудники"));
        await d.wait(1500);
        await d.moveTo(h2(d.page, "Предложения"));
        await d.moveTo(d.page.getByRole("button", { name: "Создать черновик маршрута" }).first());
      },
    },
  ],
  outro: "Это вся аналитика. Дальше — уведомления сотрудникам и настройки.",
  outroCard: "Следующий ролик — уведомления и настройки",
};
