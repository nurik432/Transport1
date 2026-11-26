// Маршруты: карточка маршрута, остановки и смещения, расписание, версии, мастер создания.
import { openSection } from "../lib/ui.mjs";

const section = (page, name) => page.getByRole("heading", { name, level: 2 });

export default {
  title: "Маршруты и расписание",
  subtitle: "Шаг 4: остановки по порядку, время в пути, отправления и машины",
  start: "/admin",
  intro: "Маршрут — самый содержательный справочник. Важно помнить: маршрут описывает одно направление. Утро на работу и вечер домой — две записи с одинаковым номером.",
  steps: [
    {
      say: "Откройте «Маршруты». В таблице видно направление, число остановок и отправлений, длину пути по дорогам и среднюю загрузку.",
      do: (d) => openSection(d, "Маршруты"),
    },
    {
      say: "Откроем готовый маршрут номер один, утренний.",
      do: async (d) => {
        await d.click(d.page.getByRole("link", { name: /№1 .*\(утро\)/ }));
        await d.page.waitForLoadState("networkidle").catch(() => {});
        await d.wait(800);
      },
    },
    {
      say: "Сверху — панель готовности. Если маршруту чего-то не хватает — остановок, расписания, рейсов или водителя, — здесь будет написано, чего именно, и рядом кнопка, которая это исправит.",
      do: async (d) => {
        await d.highlight(d.page.getByRole("heading", { level: 2 }).first().locator(".."));
      },
    },
    {
      say: "Блок «Основное»: номер, направление, статус, описание и цвет. Цвет — это значок маршрута и линия на карте мониторинга, поэтому у соседних маршрутов делайте цвета разными.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(section(d.page, "Основное"));
        await d.highlight(d.page.getByRole("button", { name: /^Цвет #/ }).first().locator(".."));
      },
    },
    {
      say: "Дальше — точки маршрута на карте. Найдите место по названию, нажмите на серую точку, чтобы добавить существующую остановку, или на пустое место карты, чтобы создать новую.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(section(d.page, "Точки маршрута на карте"));
        await d.page.evaluate(() => window.scrollBy({ top: 120, behavior: "smooth" }));
        await d.wait(600);
        await d.moveTo(d.page.locator(".leaflet-container").first(), { dx: 0.5, dy: 0.45 });
      },
    },
    {
      say: "Линия прокладывается по дорогам сама, как только вы меняете точки. Под картой видно длину пути.",
      do: async (d) => {
        await d.highlight(d.page.getByText(/Путь по дорогам/).first());
      },
    },
    {
      say: "Ниже — остановки по порядку и «Через, мин»: сколько минут от отправления рейса до этой остановки. Время подставляется по длине пути. Если вы поправите его руками, система его не затрёт.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(section(d.page, "Остановки и время в пути"));
        await d.page.evaluate(() => window.scrollBy({ top: 160, behavior: "smooth" }));
        await d.wait(600);
        await d.highlight(d.page.getByRole("spinbutton", { name: "Через, мин" }).nth(2));
      },
    },
    {
      say: "Порядок меняют перетаскиванием за ручку слева или стрелками вверх и вниз. Минус убирает остановку из маршрута, но не из справочника.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(d.page.getByRole("button", { name: /Переместить «.*» ниже/ }).nth(2));
        await d.wait(700);
        await d.moveTo(d.page.getByRole("button", { name: /Убрать «.*» из маршрута/ }).nth(2));
      },
    },
    {
      say: "Расписание отправлений. У каждого времени можно задать, сколько машин выезжает, и закрепить водителя и транспорт. Каждая машина — отдельный рейс.",
      do: async (d) => {
        await d.moveTo(section(d.page, "Расписание отправлений"));
        await d.page.evaluate(() => window.scrollBy({ top: 200, behavior: "smooth" }));
        await d.wait(600);
        await d.highlight(d.page.getByRole("group", { name: "Машин в 07:30" }));
      },
    },
    {
      say: "Новое время добавляется полем «Новое отправление» и кнопкой «Добавить время». Ниже отмечаются дни недели — они действуют на все отправления маршрута.",
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(d.page.getByRole("textbox", { name: "Новое отправление" }));
        await d.wait(1200);
        await d.highlight(d.page.getByRole("button", { name: "Пн", exact: true }).locator(".."));
      },
    },
    {
      say: "В самом низу — версии маршрута. Когда меняется состав или порядок остановок, создаётся новая версия, а прошлые рейсы остаются на старой. Перед сохранением система покажет, сколько рейсов и пассажиров затронет правка.",
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(section(d.page, "Версии маршрута"));
        await d.highlight(section(d.page, "Версии маршрута").locator(".."));
      },
    },
    {
      say: "Новый маршрут создают кнопкой «Создать маршрут» на странице списка.",
      do: async (d) => {
        await d.unhighlight();
        await openSection(d, "Маршруты");
        await d.click(d.page.getByRole("link", { name: "Создать маршрут" }));
        await d.page.waitForLoadState("networkidle").catch(() => {});
        await d.wait(600);
      },
    },
    {
      say: "Создание идёт по четырём шагам: основное, точки на карте, расписание и проверка. Кнопка «Далее» не нажимается, пока чего-то не хватает, и прямо над ней написано, чего именно.",
      do: async (d) => {
        await d.highlight(d.page.getByRole("list").filter({ hasText: "Шаг 1 из 4" }).first());
        await d.wait(1500);
        await d.highlight(d.page.getByText("Чтобы продолжить:"));
      },
    },
    {
      say: "Введём номер маршрута, описание, выберем цвет — и кнопка «Далее» стала доступна.",
      do: async (d) => {
        await d.unhighlight();
        await d.type(d.page.getByRole("textbox", { name: /Номер маршрута/ }), "№4");
        await d.type(d.page.getByRole("textbox", { name: "Описание" }), "Кайраккум — Головной офис");
        await d.click(d.page.getByRole("button", { name: "Цвет #7c3aed" }));
        await d.moveTo(d.page.getByRole("button", { name: "Далее" }));
      },
    },
    {
      say: "Дальше отмечаете точки на карте, задаёте время отправления и на последнем шаге проверяете и запускаете маршрут. После запуска он открывается одной страницей, как тот, что мы только что смотрели.",
      do: async (d) => {
        await d.click(d.page.getByRole("button", { name: "Далее" }));
        await d.wait(1500);
      },
    },
  ],
  outro: "Маршруты готовы. Следующий шаг — пассажиры.",
  outroCard: "Следующий ролик — пассажиры",
};
