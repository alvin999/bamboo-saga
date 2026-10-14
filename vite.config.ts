import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5188,
    strictPort: false,
    watch: {
      ignored: ['**/src-tauri/**', '**/target/**', '**/src-tauri/target/**'],
    },
  },
  clearScreen: false,
});
