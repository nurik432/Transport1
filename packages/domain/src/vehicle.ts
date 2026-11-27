/**
 * The vehicle model is optional: imported fleets often know only the plate.
 * Every screen names a vehicle through these helpers, so an empty model never
 * leaves a dangling separator ("7776TT02 · ").
 */

interface VehicleName {
  number: string;
  model?: string | null;
}

/** "7776TT02 · Спринтер", or just "7776TT02" without a model. */
export function vehicleLabel(v: VehicleName): string {
  const model = v.model?.trim();
  return model ? `${v.number} · ${model}` : v.number;
}

/** "Спринтер, 7776TT02", or just "7776TT02" without a model — model first, as riders look for it. */
export function vehicleTitle(v: VehicleName): string {
  const model = v.model?.trim();
  return model ? `${model}, ${v.number}` : v.number;
}
