import { requireRole } from "@/lib/auth";
import { getThresholds } from "@/lib/queries";
import { getDeviationSettings } from "@/lib/live";
import { AdminMain, PageHeader } from "@/components/admin-ui";
import { Card, SectionTitle } from "@/components/ui";
import { ThresholdsForm } from "./thresholds-form";
import { LiveSettingsForm } from "./live-form";

export default async function SettingsPage() {
  await requireRole("admin");
  const [t, live] = await Promise.all([getThresholds(), getDeviationSettings()]);

  return (
    <AdminMain>
      <PageHeader title="Настройки" description="Пороговые значения, по которым система помечает маршруты." />

      <div className="grid max-w-5xl gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <ThresholdsForm thresholds={t} />
          <LiveSettingsForm settings={live} />
        </div>

        <Card className="text-sm">
          <SectionTitle>Как считается загрузка</SectionTitle>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
            <li>Спрос — число пассажиров, записавшихся на рейс.</li>
            <li>Факт — максимальное число людей в салоне по отметкам водителя.</li>
            <li>Загрузка рейса = наибольшее из этих двух, делённое на вместимость транспорта.</li>
            <li>
              Маршрут помечается как перегруженный, если доля рейсов с загрузкой не ниже порога превышает заданную
              долю, либо если средняя загрузка достигла порога средней.
            </li>
            <li>Маршрут помечается как недозагруженный, если средняя загрузка ниже порога низкой загрузки.</li>
          </ol>
          <p className="mt-3 text-xs">
            Спрос может превышать вместимость: это и есть сигнал, что сотрудники не помещаются в транспорт.
          </p>
        </Card>
      </div>
    </AdminMain>
  );
}
