import path from 'path';
import { fileURLToPath } from 'url'; // [New] 引入 url 模块
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// [Fix] 在 ESM 模式下手动定义 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          // [Fix] 现在 __dirname 可以正确工作了，@ 将指向项目根目录
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
