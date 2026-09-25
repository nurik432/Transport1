import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Корпоративный транспорт",
    short_name: "Транспорт",
    description: "Маршруты, остановки и расписание корпоративного транспорта",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f4f7",
    theme_color: "#1f4fd8",
    lang: "ru",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
