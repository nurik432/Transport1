import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./globals.css";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Корпоративный транспорт",
  description: "Маршруты, расписание и загрузка корпоративного транспорта",
  applicationName: "Корпоративный транспорт",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Транспорт" },
};

export const viewport: Viewport = {
  themeColor: "#1f4fd8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <body>{children}</body>
    </html>
  );
}
