import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // ЯВНО УКАЗЫВАЕМ, ЧТО КОРНЕВОЙ КАТАЛОГ — ЭТО ТЕКУЩАЯ ПАПКА
  root: '.', 
  plugins: [react()],
})