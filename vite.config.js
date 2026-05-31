import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
import { execSync } from "child_process";

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(execSync("git rev-parse --short HEAD").toString().trim()),
    __BUILD_DATE__: JSON.stringify(execSync("git log -1 --format=%ai").toString().trim().split(" ")[0]),
  },
  plugins: [react()],
})
