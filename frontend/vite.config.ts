import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/",
  server: {
    port: 1111,
    strictPort: true,
  },
  plugins: [tailwindcss(), svelte()],
});
