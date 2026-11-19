/// <reference types="vite/client" />
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

/**
 * The address of the API during development.
 *
 * In production the two are behind one reverse proxy and share an origin.
 * In development the web app runs on its own port, so it forwards the API
 * paths to the API. The `Origin` header is left alone, so the API still
 * sees the browser's real origin and its origin check works as it will in
 * production.
 */
const API_URL = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: API_URL,
        changeOrigin: false,
      },
      "/uploads": {
        target: API_URL,
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: false,
  },
});
