"use server";

import { redirect } from "next/navigation";
import { HOME_BY_ROLE, login } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const phone = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const result = await login(phone, password);
  if (!result.ok) return { error: result.error };

  const target = next.startsWith("/") ? next : HOME_BY_ROLE[result.role];
  redirect(target);
}
