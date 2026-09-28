import { requireRole } from "@/lib/auth";
import { faqFor } from "@/lib/faq";
import { AdminMain, PageHeader } from "@/components/admin-ui";
import { FaqList } from "@/components/faq-list";

export default async function AdminHelp() {
  await requireRole("admin");

  return (
    <AdminMain>
      <PageHeader
        eyebrow="Справка"
        title="Вопросы и ответы"
        description="То, что чаще всего спрашивают про панель и расчёты"
      />
      <div className="max-w-3xl">
        <FaqList sections={faqFor("admin")} />
      </div>
    </AdminMain>
  );
}
