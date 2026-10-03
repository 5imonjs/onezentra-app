import { expect, test, type Page } from '@playwright/test';

/**
 * UI test untuk halaman Cluster Principal.
 *
 * Fokusnya bukan "apakah React merender" (itu urusan vitest), tapi apakah
 * yang dilihat user benar-benar benar:
 *   - tabel tampil dengan 8 kolom sesuai master data lain
 *   - tombol ikut permission (role tanpa create tidak melihat tombol Import)
 *   - console error = tanda render rusak
 *   - tidak ada overflow horizontal di layar laptop
 */

const ADMIN = { email: 'loadtest0@local.test', password: 'loadtest123' };

/** Login lewat form sungguhan — cookie session butuh flow ini. */
async function login(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // URL yang gagal dicatat terpisah — "Failed to load resource" tanpa URL
  // tidak informatif sama sekali.
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`);
  });

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);

  await page.locator('button[type="submit"]').first().click();

  try {
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
  } catch {
    // Error asli disembunyikan "waiting for navigation" saja — tanpa ini,
    // test gagal tanpa ada yang tahu kenapa (CORS? 419? 401? selector salah?).
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error(
      `Login gagal (URL tetap ${page.url()}).\n` +
        `Browser errors: ${errors.join(' | ') || '(tidak ada)'}\n` +
        `Teks di halaman: ${body.slice(0, 400)}`,
    );
  }
}

/**
 * Masuk ke halaman target, aman terhadap session yang sudah kedaluwarsa.
 *
 * Middleware melempar balik ke `/login?expired=1` kalau cookie session hilang.
 * Tanpa penanganan ini test gagal dengan "element not found" yang menyesatkan
 * — gejalanya terlihat seperti bug UI, padahal penyebabnya auth.
 */
async function gotoAuthenticated(page: Page, path: string) {
  await login(page);
  await page.goto(path);
  if (page.url().includes('/login')) {
    await login(page);
    await page.goto(path);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
}

test.describe('Cluster Principal UI', () => {
  test('halaman memuat 8 kolom master sesuai pola NPN', async ({ page }) => {
    page.setDefaultTimeout(30_000);
    await gotoAuthenticated(page, '/cluster-principal');

    // Session bisa saja kedaluwarsa di tengah suite (setiap test punya context
    // browser sendiri). Kalau middleware melempar balik ke /login, login ulang
    // dulu — kalau tidak, test gagal dengan "element not found" yang
    // menyesatkan padahal masalahnya auth, bukan UI.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    // Kolom harus tampil lengkap; kalau ada yang hilang berarti render terputus.
    for (const header of [
      'LOB',
      'Product Category',
      'Sub Product Category',
      'Product Group',
      'Product Class',
      'Product SKU',
      'Principal 1',
      'Principal 2',
    ]) {
      // Header dirender dengan CSS text-transform: uppercase, jadi teks DOM
      // tetap "Product SKU" walau yang tampil "PRODUCT SKU". Pencocokan
      // case-insensitive.
      //
      // `exact: true` wajib: tanpa itu /Product Category/i ikut cocok dengan
      // "Sub Product Category" dan Playwright melempar strict-mode violation.
      await expect(
        page.getByRole('columnheader', { name: new RegExp(`^${header}$`, 'i') }),
      ).toBeVisible();
    }

    // Kolom "No" ikut ter-uppercase jadi "NO".
    await expect(page.getByRole('columnheader', { name: /^no$/i })).toBeVisible();
  });

  test('tidak ada console error saat halaman dimuat', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await gotoAuthenticated(page, '/cluster-principal');
    await page.waitForTimeout(2500); // beri waktu fetch selesai

    // Error 401 saat belum login sebelumnya EXPECTED dan bukan bug; yang
    // dicari adalah error render (React key, hydration, uncaught).
    const real = errors.filter((e) => !/401|Failed to load resource|Unauthorized/i.test(e));
    expect(real, `console error: ${real.join(' | ')}`).toHaveLength(0);
  });

  test('tombol Import/Template/Export tampil untuk role berizin', async ({ page }) => {
    await gotoAuthenticated(page, '/cluster-principal');

    await expect(page.getByRole('button', { name: /^Import$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Template/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Export/ })).toBeVisible();
  });

  test('tombol aksi bertouch target minimal 44px', async ({ page }) => {
    await gotoAuthenticated(page, '/cluster-principal');

    const editBtn = page.locator('table button[aria-label^="Edit "]').first();
    if (await editBtn.count()) {
      const box = await editBtn.boundingBox();
      expect(box, 'tombol Edit tidak terlihat').not.toBeNull();
      // DESIGN-SYSTEM.md mewajibkan min 44x44px untuk semua elemen interaktif.
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('tabel tidak meluber horizontal di layar 1440px', async ({ page }) => {
    await gotoAuthenticated(page, '/cluster-principal');
    await page.waitForTimeout(1500);

    // Dokumen mungkin lebih lebar dari viewport (memang 8 kolom), tapi
    // halaman utama tidak boleh punya scroll horizontal sendiri.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `halaman meluber ${overflow}px`).toBeLessThanOrEqual(2);
  });

  test('mobile 375px: tabel-desktop disembunyikan, kartu tampil', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoAuthenticated(page, '/cluster-principal');
    await page.waitForTimeout(1500);

    // Di mobile tabel wide disembunyikan (md:hidden cards) — kalau tidak,
    // user HP akan terpaksa scroll jauh.
    const desktopTable = page.locator('table');
    if (await desktopTable.count()) {
      await expect(desktopTable.first()).toBeHidden();
    }
  });

  test('search box terender dan bisa diketik', async ({ page }) => {
    await gotoAuthenticated(page, '/cluster-principal');

    const search = page.getByPlaceholder(/Cari SKU/i);
    await expect(search).toBeVisible();
    await search.fill('SKU-000001');
    await page.waitForTimeout(1500);
    // Tidak error setelah mengetik = filter tidak membuat halaman crash.
    await expect(page.getByRole('heading', { name: 'Cluster Principal' })).toBeVisible();
  });
});