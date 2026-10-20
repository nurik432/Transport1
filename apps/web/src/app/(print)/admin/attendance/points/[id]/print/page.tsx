import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { PrintButton } from "./print-button";

/** Public origin for the QR link: APP_URL when set, else the request's own host. */
async function appOrigin(): Promise<string> {
  const fromEnv = process.env.APP_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * A printable A4 sheet: the QR, the point's name and one line of instruction.
 * Lives outside the admin zone so the sidebar never ends up on paper.
 */
export default async function PointPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const rows = await db.select().from(schema.attendancePoints).where(eq(schema.attendancePoints.id, id)).limit(1);
  const point = rows[0];
  if (!point) notFound();

  const url = `${await appOrigin()}/driver/checkin?p=${encodeURIComponent(point.token)}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 640 });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col items-center gap-8 px-6 py-10 print:max-w-none print:gap-10 print:py-16">
      <div className="flex w-full items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-muted-foreground">Распечатайте на А4 и повесьте на уровне глаз у проходной.</p>
        <PrintButton />
      </div>

      <h1 className="text-center text-[34px] leading-tight font-extrabold tracking-[-0.02em] print:text-[44px]">{point.name}</h1>

      {/* Built server-side from a trusted library; the SVG holds nothing but the code. */}
      <div
        aria-label="QR-код точки сканирования"
        role="img"
        className="w-full max-w-[480px] rounded-3xl border border-border bg-white p-6 print:max-w-[560px] print:border-2 print:border-black [&_svg]:size-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[22px] font-bold print:text-[28px]">Табель водителей</p>
        <p className="max-w-md text-[17px] text-muted-foreground print:text-black print:text-[20px]">
          Наведите камеру телефона на код утром по прибытии и вечером перед выездом.
        </p>
      </div>

      <p className="mt-auto break-all text-center text-xs text-muted-foreground print:text-[11px] print:text-black">{url}</p>
    </main>
  );
}
