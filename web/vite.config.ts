import { defineConfig } from 'vite';

// Raiz do Vite = web/. Importa o contrato de dados de ../engine.
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    fs: { allow: ['..'] },
  },
});
