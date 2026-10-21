const { chromium } = require('/Users/langkaukami/onezentra-warehouse-system/onezentra-web/node_modules/playwright-core');

const OUT = '/private/var/folders/3z/sp8y4gs50ln6dm55xc1kf9_00000gn/T/opencode/shots';
const PAGES = [
  ['login', '/login'],
  ['dashboard', '/dashboard'],
  ['replenishment', '/rencana-kirim'],
  ['gate', '/gate'],
  ['validasi-sj', '/validasi-sj'],
  ['receiving', '/receiving'],
  ['opname-expired', '/opname-expired'],
  ['biaya-thl', '/biaya-thl'],
  ['npn', '/npn'],
  ['reports-selisih', '/reports/selisih-qty'],
  ['users', '/users'],
  ['roles', '/roles'],
];

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.5,
    locale: 'id-ID',
    timezone: 'Asia/Jakarta',
  });
  const page = await ctx.newPage();
  const log = (m) => console.log('· ' + m);

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/login.png` });
  log('login');

  await page.fill('input[type="email"]', 'admin@onezentra.com');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/dashboard/, { timeout: 45000 });
  } catch (e) {
    log('login redirect timeout: ' + page.url());
  }
  await page.waitForTimeout(2500);

  for (const [name, path] of PAGES.slice(1)) {
    try {
      await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      log(name + '  (' + page.url() + ')');
    } catch (e) {
      log('FAIL ' + name + ': ' + e.message.split('\n')[0]);
    }
  }
  await browser.close();
  log('done');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
