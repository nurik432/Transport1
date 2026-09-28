"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { firstIncompleteStep, routeStepBlockers, type RouteFormStep } from "@transport/domain";
import { Button, Card, SectionTitle } from "@/components/ui";
import { describeRouteSave, saveRoute, type SaveImpact } from "../../actions";
import { ReadinessPanel } from "./readiness-panel";
import { SaveConsequences } from "./save-consequences";
import { StepBasics } from "./step-basics";
import { StepPoints } from "./step-points";
import { StepReview } from "./step-review";
import { StepSchedule } from "./step-schedule";
import { StopList } from "./stop-list";
import { VersionsCard } from "./versions-card";
import { WIZARD_STEPS, WizardFrame } from "./wizard-frame";
import type { ReadinessFacts, RouteEditorInit, StopOption, VersionSummary } from "./types";
import { useRouteEditor } from "./use-route-editor";
import { useRoutePath } from "./use-route-path";

/**
 * The route form: a wizard when creating, one page when editing.
 *
 * Both share this component's state and rules. Creating is a sequence because
 * there is an order to it and nothing to come back to halfway; editing is not,
 * because changing one field should not walk anybody through four steps.
 */
export function RouteEditor({
  mode,
  initial,
  stopOptions,
  facts,
  versions = [],
  savedPath = null,
  savedPathSource = null,
  savedDistanceM = null,
  suggestedDeparture = null,
}: {
  mode: "create" | "edit";
  initial: RouteEditorInit;
  stopOptions: StopOption[];
  facts: ReadinessFacts;
  versions?: VersionSummary[];
  /** geometry of the version being edited, shown until the shape changes */
  savedPath?: [number, number][] | null;
  /** how that geometry was built; "straight" must not be shown as a road path */
  savedPathSource?: "road" | "straight" | null;
  savedDistanceM?: number | null;
  /** departure proposed by the analysis screen */
  suggestedDeparture?: string | null;
}) {
  const router = useRouter();
  const editor = useRouteEditor(initial, stopOptions);
  const [step, setStep] = useState<RouteFormStep>(0);
  const [versionNote, setVersionNote] = useState("");
  const [impact, setImpact] = useState<SaveImpact | null>(null);
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const [checking, setChecking] = useState(false);

  const { value } = editor;
  const points = useMemo(() => value.stops.map((s) => ({ lat: s.lat, lng: s.lng })), [value.stops]);
  const path = useRoutePath({
    stops: points,
    savedPath,
    savedSource: savedPathSource,
    savedDistanceM,
    onSuggestedOffsets: editor.applyOffsets,
  });

  // Unsaved work is easy to lose in a wizard, where nothing exists on the
  // server until the last step.
  useEffect(() => {
    if (!editor.dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editor.dirty]);

  const blockingError = Object.values(editor.problems.errors)[0];
  // Never sit on a step whose groundwork was taken away on an earlier one.
  const reachable = firstIncompleteStep(editor.formInput);
  const currentStep = Math.min(step, Math.max(reachable, 0)) as RouteFormStep;
  const blockers = routeStepBlockers(currentStep, editor.formInput);

  function save() {
    setResult(null);
    setImpact(null);
    start(async () => {
      const res = await saveRoute(payload());
      setResult(res);
      if (res.ok && res.id && !value.id) {
        router.push(`/admin/routes/${res.id}`);
      } else if (res.ok) {
        editor.markSaved();
        setVersionNote("");
        router.refresh();
      }
    });
  }

  function payload() {
    return {
      ...(value.id ? { id: value.id } : {}),
      name: value.name,
      description: value.description,
      direction: value.direction,
      status: value.status,
      color: value.color,
      plannedCapacity: value.plannedCapacity === "" ? null : Number(value.plannedCapacity),
      stops: value.stops.map((s) => ({
        stopId: s.stopId,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        offsetMin: s.offsetMin,
      })),
      departures: value.departures,
      daysOfWeek: value.daysOfWeek,
      versionNote: versionNote || undefined,
    };
  }

  /**
   * Editing an existing route asks the server what the save would do first.
   * A new route has nothing to break, and a rename has no consequences worth
   * stopping for — warning about those is what taught people to click through.
   */
  async function requestSave() {
    if (!value.id || !editor.dirty) {
      save();
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const res = await describeRouteSave(payload());
      if ("impact" in res) setImpact(res.impact);
      else setResult(res);
    } catch {
      // The warning is a courtesy; if it cannot be produced, let the save proceed.
      save();
    } finally {
      setChecking(false);
    }
  }

  const alerts = (
    <>
      {result?.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}
      {result?.ok && result.message ? (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-green-800">
          {result.message}
        </p>
      ) : null}
    </>
  );

  // ------------------------------------------------------------------ create
  if (mode === "create") {
    const stepBody = [
      <StepBasics key="basics" editor={editor} />,
      <StepPoints key="points" editor={editor} path={path} />,
      <StepSchedule key="schedule" editor={editor} suggestedDeparture={suggestedDeparture} />,
      <StepReview key="review" editor={editor} path={path} />,
    ][currentStep];

    return (
      <div className="flex flex-col gap-5">
        <WizardFrame
          step={currentStep}
          reached={reachable}
          blockers={blockers}
          title={WIZARD_STEPS[currentStep] ?? ""}
          onStep={(i) => setStep(i as RouteFormStep)}
          onBack={() => setStep((s) => Math.max(0, s - 1) as RouteFormStep)}
          onNext={() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1) as RouteFormStep)}
          footer={
            <Button onClick={save} disabled={pending || Boolean(blockingError)}>
              {pending ? "Создаём…" : "Создать маршрут"}
            </Button>
          }
        >
          {stepBody}
        </WizardFrame>

        {/* The list of stops belongs with the map: the order and the times are
            the same decision seen two ways. */}
        {currentStep === 1 ? (
          <Card id="stops">
            <SectionTitle>Остановки и время в пути</SectionTitle>
            <StopList editor={editor} />
          </Card>
        ) : null}

        {currentStep === 3 ? <ReadinessPanel editor={editor} facts={facts} onGoToStep={setStep} /> : null}

        {alerts}
      </div>
    );
  }

  // -------------------------------------------------------------------- edit
  return (
    <div className="flex flex-col gap-6">
      <ReadinessPanel editor={editor} facts={facts} routeId={value.id} />

      <Card>
        <SectionTitle>Основное</SectionTitle>
        <StepBasics editor={editor} />
      </Card>

      <Card>
        <SectionTitle>Точки маршрута на карте</SectionTitle>
        <StepPoints editor={editor} path={path} />
      </Card>

      <Card id="stops" className="scroll-mt-4">
        <SectionTitle>Остановки и время в пути</SectionTitle>
        <StopList editor={editor} />
      </Card>

      <Card id="schedule" className={suggestedDeparture ? "scroll-mt-4 ring-2 ring-primary" : "scroll-mt-4"}>
        <SectionTitle>Расписание отправлений</SectionTitle>
        <StepSchedule editor={editor} suggestedDeparture={suggestedDeparture} />
      </Card>

      <VersionsCard versions={versions} />

      {alerts}
      {blockingError ? <p className="text-sm text-danger">{blockingError}</p> : null}

      {impact ? (
        <SaveConsequences
          impact={impact}
          note={versionNote}
          onNote={setVersionNote}
          pending={pending}
          onConfirm={save}
          onCancel={() => setImpact(null)}
        />
      ) : (
        <div className="flex gap-2">
          <Button onClick={requestSave} disabled={pending || checking || Boolean(blockingError)}>
            {checking ? "Проверяем…" : pending ? "Сохранение…" : "Сохранить маршрут"}
          </Button>
          <Button variant="secondary" onClick={() => router.push("/admin/routes")}>
            К списку
          </Button>
        </div>
      )}

      {editor.dirty ? (
        <p className="text-xs text-muted-foreground">
          Есть несохранённые изменения. Перед сохранением покажем, что именно поменяется.
        </p>
      ) : null}
    </div>
  );
}
