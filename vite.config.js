import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { earthPulseApi } from './server/api.js';

export default defineConfig({
  plugins: [cesium(), earthPulseApi()],
  server: { port: 5173, fs: { deny: ['.env', '.env.*'] } },
  build: { chunkSizeWarningLimit: 6000 },
});
