import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8000";
  return {
    plugins: [react()],
    server: {
      host: env.VITE_HOST || "127.0.0.1",
      port: Number(env.VITE_PORT || 5173),
      strictPort: true,
      proxy: {
        "/api": { target, changeOrigin: true },
        "/ws": { target, ws: true },
      },
    },
    preview: {
      host: env.VITE_HOST || "127.0.0.1",
      port: Number(env.VITE_PREVIEW_PORT || 4173),
    },
  };
});
