import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Vendor code changes far less often than the app, so keep it in separately cached chunks.
const vendorChunks: Record<string, RegExp> = {
  react: /node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?(react|react-dom|scheduler)\//,
  supabase: /node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?@supabase\//,
  ui: /node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?(@base-ui|@floating-ui|sonner|lucide-react|cn|tabbable)\//,
};

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => Object.keys(vendorChunks).find((name) => vendorChunks[name].test(id)),
      },
    },
  },
});
