// Пассажиры: завести сотрудника, найти, привязать к постоянному рейсу.
import { openSection, row } from "../lib/ui.mjs";

const NAME = "Шахноза Каримова";

export default {
  title: "Пассажиры",
  subtitle: "Шаг 5: сотрудники, их доступ и постоянные рейсы",
  start: "/admin",
  intro: "Пассажиры — это сотрудники, которые ездят корпоративным транспортом. Самостоятельной регистрации нет: доступ каждому выдаёт администратор.",
  steps: [
    {
      say: "Откройте «Справочники», «Пассажиры». В подзаголовке видно, сколько всего сотрудников заведено и сколько из них ездили за последние две недели.",
      do: async (d) => {
        await openSection(d, "Пассажиры");
        await d.highlight(d.page.getByText(/Всего \d+, ездили/));
      },
    },
    {
      say: "Нажмите «Добавить пассажира». Имя и фамилию водитель увидит в списке ожидающих. Телефон — логин сотрудника, пароль — не короче шести символов.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole("button", { name: /Добавить пассажира/ }));
        await d.type(d.page.getByRole("textbox", { name: "Имя и фамилия" }).first(), NAME);
        await d.type(d.page.getByRole("textbox", { name: "Телефон" }).first(), "+992919990001");
        await d.type(d.page.getByRole("textbox", { name: /^Пароль/ }).first(), "pass2026");
      },
    },
    {
      say: "Отдел нужен для поиска и отчётов. Домашний адрес и точку дома на карте заполнять не обязательно, но с ними система подскажет ближайшую остановку и учтёт сотрудника в прогнозе.",
      do: async (d) => {
        await d.type(d.page.getByRole("textbox", { name: "Отдел" }).first(), "Бухгалтерия");
        await d.type(d.page.getByRole("textbox", { name: "Домашний адрес" }).first(), "18-й микрорайон, дом 7");
        const map = d.page.locator(".leaflet-container").first();
        const b = await d.box(map);
        await d.clickPoint(b.x + b.width * 0.45, b.y + b.height * 0.4);
      },
    },
    {
      say: "Нажимаем «Создать».",
      do: async (d) => {
        await d.click(d.page.getByRole("button", { name: "Создать", exact: true }).first());
        await d.wait(1300);
        await d.scrollTop();
      },
    },
    {
      say: "Сотрудника легко найти поиском по имени, телефону или отделу.",
      do: async (d) => {
        await d.type(d.page.getByRole("textbox", { name: /Поиск по имени/ }), "Каримова");
        await d.click(d.page.getByRole("button", { name: "Найти" }));
        await d.page.waitForLoadState("networkidle").catch(() => {});
        await d.wait(700);
        await d.highlight(row(d.page, NAME));
      },
    },
    {
      say: "Кнопка «Рейсы» открывает постоянные рейсы сотрудника. Если человек каждый день ездит одним и тем же рейсом, привяжите его — и система будет записывать его на рейс автоматически.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(row(d.page, NAME).getByRole("button", { name: "Рейсы" }));
        await d.wait(900);
      },
    },
    {
      say: "Для утра выберите рейс и остановку посадки и нажмите «Привязать». Вечер настраивается так же, отдельно.",
      do: async (d) => {
        const trip = d.page.getByRole("combobox", { name: /^(Рейс|Перевести на рейс)$/ }).first();
        await d.select(trip, { index: 1 });
        const stop = d.page.getByRole("combobox", { name: "Остановка посадки" }).first();
        await d.select(stop, { index: 1 });
        await d.click(d.page.getByRole("button", { name: "Привязать" }).first());
        await d.wait(1200);
      },
    },
    {
      say: "Если сотрудник скажет «завтра не поеду», привязка не пропадает: отменяется только запись на этот день. Отвязать или перевести на другой рейс можно здесь же.",
    },
    {
      say: "Кнопка «Заблокировать» в строке сотрудника закрывает вход уволенному, история поездок сохраняется.",
      do: async (d) => {
        await d.moveTo(d.page.getByRole("button", { name: "Заблокировать" }).first());
      },
    },
  ],
  outro: "Сотрудники заведены. Осталось проверить настройки и создать рейсы.",
  outroCard: "Следующий ролик — рейсы",
};
