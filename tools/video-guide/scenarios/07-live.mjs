// Мониторинг: карта, список машин, сигналы.
import { openSection } from "../lib/ui.mjs";

const list = (page) => page.getByRole("complementary", { name: "Транспорт на линии" });

export default {
  title: "Мониторинг",
  subtitle: "Где сейчас машины, кто опаздывает и кто ушёл с маршрута",
  start: "/admin",
  intro: "Мониторинг показывает машины, которые сейчас в рейсе: на карте и списком, с прогнозом прибытия к следующей остановке.",
  steps: [
    {
      say: "Откройте «Сейчас», «Мониторинг». Слева карта, справа список машин на линии.",
      do: async (d) => {
        await openSection(d, "Мониторинг");
        await d.wait(1200);
      },
    },
    {
      say: "Сверху — фильтр: все машины, только требующие внимания и рейсы, которые не выехали вовремя.",
      do: async (d) => {
        await d.highlight(list(d.page).getByRole("tablist", { name: "Фильтр" }));
      },
    },
    {
      say: "Проблемные машины поднимаются наверх. Справа в строке — метка: сколько метров до линии маршрута, сколько минут нет GPS или «на связи».",
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(list(d.page).getByRole("listitem").first());
      },
    },
    {
      say: "Вторая строка: следующая остановка, через сколько минут машина туда приедет, опоздание к расписанию и сколько людей в салоне из скольких мест.",
      do: async (d) => {
        await d.highlight(list(d.page).getByRole("listitem").first().getByRole("paragraph"));
      },
    },
    {
      say: "Нажмите на машину — карта переместится к ней. Здесь видно, что автобус второго маршрута ушёл с линии в сторону.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(list(d.page).getByRole("button", { name: /^№2/ }).first());
        await d.wait(1800);
      },
    },
    {
      say: "Если потянуть карту рукой, слежение за машиной выключится, и можно спокойно осмотреть окрестности.",
      do: async (d) => {
        const b = await d.box(d.page.locator(".leaflet-container").first());
        const x = b.x + b.width * 0.5;
        const y = b.y + b.height * 0.5;
        await d.movePoint(x, y);
        await d.page.mouse.down();
        await d.movePoint(x - 160, y + 60);
        await d.page.mouse.up();
        await d.wait(600);
      },
    },
    {
      say: "Данные обновляются каждые пятнадцать секунд. Координаты записываются только во время рейса: вне рейса водитель не отслеживается.",
      do: async (d) => {
        await d.highlight(list(d.page).getByText(/Обновляется каждые 15 секунд/));
      },
    },
    {
      say: "Если машина пропала со связи, позвоните водителю: телефон есть на дашборде, в карточке проблемы.",
      do: async (d) => {
        await d.unhighlight();
        await d.click(list(d.page).getByRole("tab", { name: /Внимание/ }));
        await d.wait(1200);
      },
    },
  ],
  outro: "Так выглядит ежедневный контроль. Дальше — аналитика и прогноз.",
  outroCard: "Следующий ролик — аналитика и прогноз",
};
