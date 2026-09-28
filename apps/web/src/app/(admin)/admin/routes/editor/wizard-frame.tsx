"use client";

import { useId, type ReactNode } from "react";
import { Button, Card, SectionTitle } from "@/components/ui";
import { Stepper } from "@/components/stepper";
import { IconArrowLeft, IconChevronRight } from "@/components/icons";

export const WIZARD_STEPS = ["Основное", "Точки на карте", "Расписание", "Проверка и запуск"] as const;

/**
 * One step of creating a route at a time.
 *
 * "Далее" is disabled when the step is incomplete, and the reasons are listed
 * right above it. A disabled button is only unfair when the reason is hidden;
 * here it is on screen, and the button points at it for a screen reader.
 */
export function WizardFrame({
  step,
  reached,
  blockers,
  title,
  onStep,
  onBack,
  onNext,
  children,
  footer,
}: {
  step: number;
  reached: number;
  blockers: string[];
  title: string;
  onStep: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  children: ReactNode;
  /** replaces "Далее" on the last step */
  footer?: ReactNode;
}) {
  const blockersId = useId();
  const last = step === WIZARD_STEPS.length - 1;

  return (
    <div className="flex flex-col gap-5">
      <Stepper steps={WIZARD_STEPS} current={step} reached={reached} onSelect={onStep} />

      <Card>
        <SectionTitle>{title}</SectionTitle>
        {children}
      </Card>

      {blockers.length > 0 ? (
        <div id={blockersId} className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-foreground">
          <p className="font-medium">Чтобы продолжить:</p>
          <ul className="mt-1 list-inside list-disc">
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <Button variant="secondary" onClick={onBack}>
            <IconArrowLeft className="size-4" />
            Назад
          </Button>
        ) : null}

        {last ? (
          footer
        ) : (
          <Button
            onClick={onNext}
            disabled={blockers.length > 0}
            aria-describedby={blockers.length > 0 ? blockersId : undefined}
          >
            Далее
            <IconChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
