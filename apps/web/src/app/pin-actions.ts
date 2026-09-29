"use server";

import { requireUser } from "@/lib/auth";
import { lockSession, removePin, setPin, touchSession, unlockWithPin, type PinResult } from "@/lib/pin";

// Every action needs a signed-in user; the lock itself is a screen lock and is
// deliberately not checked here, so a locked driver's app can still be unlocked.

export async function savePinAction(pin: string, currentPassword?: string): Promise<PinResult> {
  await requireUser();
  return setPin(pin, currentPassword);
}

export async function removePinAction(currentPassword: string): Promise<PinResult> {
  await requireUser();
  return removePin(currentPassword);
}

export async function unlockAction(pin: string): Promise<PinResult> {
  await requireUser();
  return unlockWithPin(pin);
}

export async function lockAction(): Promise<void> {
  await requireUser();
  await lockSession();
}

export async function touchAction(): Promise<void> {
  await requireUser();
  await touchSession();
}
