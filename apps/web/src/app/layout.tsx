import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import { appOrigin } from "@/lib/app-url";
import "./globals.css";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

const APP_NAME = "Фаровон Транспорт";
const BRAND_COLOR = "#1F5EFF";
/** Bump when the icon files change: browsers keep favicons long past their cache headers. */
const ICON_VERSION = "?v=2";

export async function generateMetadata(): Promise<Metadata> {
  return {
    // og:image must be absolute; the origin comes from APP_URL (or the request host).
    metadataBase: new URL(await appOrigin()),
    title: "Корпоративный транспорт",
    description: "Маршруты, расписание и загрузка корпоративного транспорта",
    applicationName: APP_NAME,
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Транспорт" },
    icons: {
      icon: [
        { url: `/favicon.ico${ICON_VERSION}`, sizes: "48x48" },
        { url: `/favicon.svg${ICON_VERSION}`, type: "image/svg+xml" },
        { url: `/favicon-32x32.png${ICON_VERSION}`, type: "image/png", sizes: "32x32" },
        { url: `/favicon-16x16.png${ICON_VERSION}`, type: "image/png", sizes: "16x16" },
      ],
      apple: `/apple-touch-icon.png${ICON_VERSION}`,
    },
    openGraph: {
      title: APP_NAME,
      siteName: APP_NAME,
      locale: "ru_RU",
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: APP_NAME }],
    },
    twitter: { card: "summary_large_image", title: APP_NAME, images: ["/og-image.png"] },
  };
}

export const viewport: Viewport = {
  themeColor: BRAND_COLOR,
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
