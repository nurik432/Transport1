// Пересоздаёт демо-базу перед записью: сценарии добавляют данные, и повторный прогон без сброса упадёт на дублях.
import { execSync } from "node:child_process";
import { join } from "node:path";

const url = process.env.DATABASE_URL ?? "";
if (!/demo/i.test(new URL(url).pathname)) {
  throw new Error("DATABASE_URL должен указывать на демо-базу (в имени базы должно быть demo)");
}
const repo = join(import.meta.dirname, "..", "..");
for (const cmd of ["pnpm db:reset", "pnpm db:migrate", "pnpm db:seed"]) {
  execSync(cmd, { cwd: repo, stdio: "inherit", env: process.env });
}
