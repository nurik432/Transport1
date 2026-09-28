import { requireRole } from "@/lib/auth";
import { faqFor } from "@/lib/faq";
import { FaqList } from "@/components/faq-list";

export default async function DriverHelp() {
  await requireRole("driver");

  return (
    <>
      <header className="mx-auto flex w-full max-w-md flex-col gap-0.5 px-5 pt-5 pb-3">
        <p className="text-sm text-muted-foreground">Как пользоваться приложением</p>
        <h1 className="text-2xl font-bold tracking-[-0.01em]">Вопросы и ответы</h1>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pt-1 pb-4">
        <FaqList sections={faqFor("driver")} />
      </main>
    </>
  );
}
