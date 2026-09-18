import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas pesadas e autocontidas em chunks próprios: quem só abre a
        // caixa de entrada não baixa gráficos nem geração de zip, e o cache
        // sobrevive a deploys que mexem só no código da aplicação.
        manualChunks: {
          charts: ["recharts"],
          motion: ["framer-motion"],
          zip: ["jszip"],
        },
      },
    },
  },
}));
