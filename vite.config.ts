import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // 既定では localhost（127.0.0.1）からのリクエストのみ受け付ける。
      // コンテナ内では Docker のポート転送を受けるため DEV_SERVER_HOST=0.0.0.0 を指定する
      // （ホスト側の公開範囲は docker-compose.yml で 127.0.0.1 に限定）。
      host: process.env.DEV_SERVER_HOST || '127.0.0.1',
      port: Number(process.env.DEV_SERVER_PORT) || 5173,
      // 使用中なら別ポートへ黙ってずらさず、エラーで知らせる
      strictPort: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
