import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Build der Browser-Demo: dieselbe Oberfläche, aber ohne Server, ohne Service
 * Worker und in einer einzigen Datei. Zwei Module werden ausgetauscht – der
 * Einstiegspunkt und die Scanner-Seite, die ohne Kamera auskommen muss.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^\.\/pages\/ScanPage$/,
        replacement: fileURLToPath(new URL('./src/demo/ScanPage.tsx', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: fileURLToPath(new URL('./index.demo.html', import.meta.url)),
      output: {
        // Eine Datei statt vieler: das Ergebnis wird anschließend zu einer
        // einzelnen HTML-Seite zusammengefügt.
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
