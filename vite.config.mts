import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Interface React : construite dans out/renderer, chargée par Electron en file:// (d'où base relative).
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../out/renderer",
    emptyOutDir: true,
    target: "chrome140",
  },
});
