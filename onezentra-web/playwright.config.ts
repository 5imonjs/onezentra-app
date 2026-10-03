import { defineConfig, devices } from '@playwright/test';

/**
 * UI test (browser sungguhan) untuk ONEZENTRA web.
 *
 * Berbeda dari `vitest` yang hanya menguji komponen terisolasi, test di sini
 * menjalankan halaman Next.js sungguhan di Chromium. Ini yang menutup celah
 * yang tidak bisa disentuh unit test: layout pecah, tombol tidak terlihat,
 * permission tidak menyembunyikan tombol yang seharusnya tersembunyi, dan
 * console error saat render.
 *
 * Prasyarat:
 *   1. Backend Laravel jalan di BACKEND_URL (default 127.0.0.1:8080)
 *   2. `php artisan loadtest:prepare` sudah dijalankan agar ada user + data
 *   3. `npm run dev` (atau `build && start`) di WEB_URL (default 127.0.0.1:3100)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Serial: beberapa test memakai user/token yang sama, jalankan berurutan
  // supaya tidak saling menabrak state.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});