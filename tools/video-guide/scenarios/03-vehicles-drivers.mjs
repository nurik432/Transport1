// Транспорт и водители.
import { openSection, row } from "../lib/ui.mjs";

export default {
  title: "Транспорт и водители",
  subtitle: "Шаги 2 и 3: машины с честным числом мест и водители с доступом",
  start: "/admin",
  intro: "В этом ролике заведём машину и водителя. Порядок такой: сначала транспорт, потом водитель, за которым эту машину закрепим.",
  steps: [
    {
      say: "Откройте «Справочники», «Транспорт».",
      do: (d) => openSection(d, "Транспорт"),
    },
    {
      say: "Колонка «Мест» — главное число во всей системе. От неё считается загрузка, перегрузка и прогноз. Ставьте столько мест, сколько реально можно везти.",
      do: async (d) => {
        await d.highlight(d.page.getByRole("columnheader", { name: "Мест" }).or(d.page.getByRole("cell", { name: "Мест", exact: true })).first());
      },
    },
    {
      say: "Нажмите «Добавить транспорт». Заполните госномер, модель и число мест.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole("button", { name: /Добавить транспорт/ }));
        await d.type(d.page.getByRole("textbox", { name: "Гос. номер" }), "05 E 345 AE");
        await d.type(d.page.getByRole("textbox", { name: "Модель" }), "Автобус Isuzu Citiport");
        await d.type(d.page.getByRole("spinbutton", { name: "Мест" }), "28");
      },
    },
    {
      say: "Статус «В работе». Если машина встала на ремонт, поставьте «На ремонте» — её перестанут предлагать при назначении, но история рейсов останется.",
      do: async (d) => {
        await d.highlight(d.page.getByRole("combobox", { name: "Статус" }));
      },
    },
    {
      say: "Нажимаем «Добавить» — машина появилась в списке.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole("button", { name: "Добавить", exact: true }));
        await d.wait(1200);
        await d.highlight(row(d.page, "05 E 345 AE"));
      },
    },
    {
      say: "Теперь «Водители». Здесь видно телефон, закреплённую машину, график работы и сколько рейсов водитель уже провёл.",
      do: async (d) => {
        await d.unhighlight();
        await openSection(d, "Водители");
      },
    },
    {
      say: "Нажмите «Добавить водителя». Телефон в формате плюс девятьсот девяносто два — это его логин. Пароль задаёте вы, не короче шести символов, и сообщаете водителю лично.",
      do: async (d) => {
        await d.click(d.page.getByRole("button", { name: /Добавить водителя/ }));
        await d.type(d.page.getByRole("textbox", { name: "Имя и фамилия" }), "Фаррух Назаров");
        await d.type(d.page.getByRole("textbox", { name: "Телефон" }), "+992900000105");
        await d.type(d.page.getByRole("textbox", { name: /^Пароль/ }), "drive2026");
      },
    },
    {
      say: "Закрепите за водителем машину. Тогда при создании рейсов система сама подставит этого водителя и этот транспорт.",
      do: async (d) => {
        await d.select(d.page.getByRole("combobox", { name: "Транспорт" }), { label: "05 E 345 AE · Автобус Isuzu Citiport" });
      },
    },
    {
      say: "Статус «Активен». «Не работает» ставят на время отпуска или больничного: водитель перестаёт предлагаться при назначении. Нажимаем «Создать».",
      do: async (d) => {
        await d.highlight(d.page.getByRole("combobox", { name: "Статус водителя" }));
        await d.wait(1500);
        await d.unhighlight();
        await d.click(d.page.getByRole("button", { name: "Создать", exact: true }));
        await d.wait(1200);
      },
    },
    {
      say: "Водитель в списке. Кнопка «Изменить» нужна, чтобы сменить пароль или машину. «Заблокировать» закрывает вход при увольнении, не трогая историю рейсов.",
      do: async (d) => {
        await d.highlight(row(d.page, "Фаррух Назаров"));
      },
    },
    {
      say: "В колонке «График» — график работы водителя, по нему считается табель. Подробнее о нём — в ролике про табель.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(row(d.page, "Фаррух Назаров").getByRole("button").first());
      },
    },
  ],
  outro: "Транспорт и водители заведены. Следующий шаг — маршруты.",
  outroCard: "Следующий ролик — маршруты",
};
