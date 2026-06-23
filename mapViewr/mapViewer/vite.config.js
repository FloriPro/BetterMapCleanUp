import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    build: {
        chunkSizeWarningLimit: 99999,
    },
    optimizeDeps: {},
    resolve: process.env.VITEST
        ? {
              conditions: ["browser"],
          }
        : undefined,
});
