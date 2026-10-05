import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  server: { host: true, port: 5176, strictPort: true },
  build: { target: 'esnext' },
  // 版本号打进界面：手机上装的是哪一版一眼能看出来（根 CLAUDE.md 的教训）
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
})
