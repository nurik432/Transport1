"use client";

import { plural } from "@transport/domain";
import { Field, inputClass } from "@/components/ui";
import { ConfirmPanel } from "@/components/confirm-panel";
import type { SaveImpact } from "../../actions";

/**
 * What saving is about to do, before it does it.
 *
 * The old form put this under the button in small print, where it was read
 * after the click. Cancelling a planned trip cannot be undone from the
 * interface, so that line in particular has to arrive first.
 */
export function SaveConsequences({
  impact,
  note,
  onNote,
  onConfirm,
  onCancel,
  pending,
}: {
  impact: SaveImpact;
  note: string;
  onNote: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const destructive = impact.cancelledTripCount > 0;

  return (
    <ConfirmPanel
      title="Проверьте, что изменится"
      confirmLabel="Сохранить маршрут"
      tone={destructive ? "danger" : "warn"}
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {impact.shapeChanged ? (
        <p>
          Создастся версия {impact.nextVersion}. Остановок было {impact.stopCountBefore}, станет{" "}
          {impact.stopCountAfter}.
        </p>
      ) : (
        <p>Форма маршрута не меняется — новая версия не создастся.</p>
      )}

      {impact.removedDepartures.length > 0 ? (
        <p>
          {impact.removedDepartures.length === 1 ? "Отправление" : "Отправления"}{" "}
          {impact.removedDepartures.join(", ")} удалено
          {impact.cancelledTripCount > 0 ? (
            <>
              {" "}
              — отменится {impact.cancelledTripCount}{" "}
              {plural(impact.cancelledTripCount, ["запланированный рейс", "запланированных рейса", "запланированных рейсов"])}.{" "}
              <strong>Вернуть отменённый рейс из интерфейса нельзя.</strong>
            </>
          ) : (
            ". Запланированных рейсов за ним нет."
          )}
        </p>
      ) : null}

      {impact.movedTripCount > 0 ? (
        <p>
          {impact.movedTripCount}{" "}
          {plural(impact.movedTripCount, [
            "запланированный рейс перейдёт",
            "запланированных рейса перейдут",
            "запланированных рейсов перейдут",
          ])}{" "}
          на новую форму маршрута.
        </p>
      ) : null}

      {impact.notifiedUserCount > 0 ? (
        <p>
          Уведомление получат {impact.notifiedUserCount}{" "}
          {plural(impact.notifiedUserCount, ["человек", "человека", "человек"])}: пассажиры с записью и водители
          будущих рейсов.
        </p>
      ) : null}

      {impact.newStopNames.length > 0 ? (
        <p>В справочник остановок добавится: {impact.newStopNames.map((n) => `«${n}»`).join(", ")}.</p>
      ) : null}

      {impact.shapeChanged ? (
        <div className="mt-1 max-w-md">
          <Field label="Что меняете" hint="Останется в истории версий — по нему потом понятно, зачем правили">
            <input
              className={inputClass}
              value={note}
              onChange={(e) => onNote(e.target.value)}
              placeholder="Например, добавлена остановка «Микрорайон 21»"
              autoFocus
            />
          </Field>
        </div>
      ) : null}
    </ConfirmPanel>
  );
}
