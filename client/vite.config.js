import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "NirantarEdu",
        short_name: "NirantarEdu",
        description: "Offline-first school learning platform",
        theme_color: "#1e3a5f",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // App shell + API GET responses are cached so the platform keeps working
        // when the device loses its LAN link to the school server temporarily.
        runtimeCaching: [
          {
            urlPattern: /\/api\/(materials|assignments|quizzes|notifications)/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "nirantaredu-api-cache" },
          },
          {
            urlPattern: /\/uploads\//,
            handler: "CacheFirst",
            options: { cacheName: "nirantaredu-files-cache" },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
      "/uploads": "http://localhost:5000",
    },
  },
});
