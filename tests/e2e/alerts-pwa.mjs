// E2E checks for health alerts, water tracking, reminders/notifications and PWA installability.
// Demo mode. Run: npm run build && npx vite preview --port 4173 & node tests/e2e/alerts-pwa.mjs [baseUrl]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.env.SHOTS || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

// New headless mode: the old one always denies notification permission.
const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
await ctx.grantPermissions(['notifications'], { origin: BASE });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// PWA basics
await page.goto(BASE + '/login');
const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
const manifest = await (await page.request.get(BASE + manifestHref)).json();
ok('manifest linked and standalone', manifest.display === 'standalone' && manifest.start_url === '/');
ok('manifest has 192/512 and maskable icons', ['192x192', '512x512'].every((s) => manifest.icons.some((i) => i.sizes === s)) && manifest.icons.some((i) => i.purpose === 'maskable'));
for (const i of manifest.icons) ok(`icon ${i.src} served as png`, (await page.request.get(BASE + i.src)).headers()['content-type'] === 'image/png');
ok('apple-touch-icon + theme-color', (await page.locator('link[rel="apple-touch-icon"]').count()) === 1 && (await page.locator('meta[name="theme-color"]').count()) === 1);
const swState = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; for (let i = 0; i < 50 && r.active?.state !== 'activated'; i++) await new Promise((res) => setTimeout(res, 100)); return r.active?.state; });
ok('service worker active', swState === 'activated', swState);

// Offline: app shell loads from cache
await page.reload(); await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.goto(BASE + '/login').catch(() => undefined);
ok('app shell loads offline', await page.getByRole('button', { name: 'Đăng nhập' }).first().isVisible().catch(() => false));
await ctx.setOffline(false);

// Demo login (sample account has 14 days of diary + 7 InBody measurements)
await page.goto(BASE + '/login');
await page.getByLabel('Email').fill('demo@nutritrack.vn');
await page.getByLabel('Mật khẩu', { exact: true }).fill('demo1234');
await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
await page.waitForURL(BASE + '/');
await page.getByText('Cảnh báo & nhắc nhở').first().waitFor();
ok('dashboard shows alerts card', await page.getByText('Cảnh báo & nhắc nhở').first().isVisible());
ok('alerts disclaimer shown', await page.getByText('không thay thế tư vấn').first().isVisible());
const alertCodes = await page.locator('[data-testid="alerts-list"] [data-code]').evaluateAll((els) => els.map((e) => e.getAttribute('data-code')));
ok('alerts listed for sample data', alertCodes.length > 0, alertCodes.join(','));

// Water tracking
await page.getByRole('button', { name: '+250 ml' }).click();
await page.waitForFunction(() => document.querySelector('[data-testid="water-total"]')?.textContent === '250');
await page.getByRole('button', { name: '+500 ml' }).click();
await page.waitForFunction(() => document.querySelector('[data-testid="water-total"]')?.textContent === '750');
ok('water adds up', true);
await page.getByRole('button', { name: 'Xóa lần thêm gần nhất' }).click();
await page.waitForFunction(() => document.querySelector('[data-testid="water-total"]')?.textContent === '250');
ok('water undo', true);
await page.screenshot({ path: `${OUT}/alerts-dashboard-mobile.png`, fullPage: true });


// Settings: toggles and notifications
await page.goto(BASE + '/settings');
ok('sample data has a reminder to switch off', alertCodes.includes('meal_missing') || alertCodes.includes('water_behind') || alertCodes.includes('inbody_due'));
await page.getByTestId('toggle-reminders').click();
await page.getByText('Đã lưu').first().waitFor();
await page.goto(BASE + '/');
await page.getByText('Cảnh báo & nhắc nhở').first().waitFor();
await page.waitForTimeout(300);
const afterCodes = await page.locator('[data-testid="alerts-list"] [data-code]').evaluateAll((els) => els.map((e) => e.getAttribute('data-code')));
const reminderCodes = ['meal_missing', 'water_behind', 'inbody_due', 'inbody_none'];
ok('turning off reminders hides them', !afterCodes.some((c) => reminderCodes.includes(c)), afterCodes.join(',') || 'none');

await page.goto(BASE + '/settings');
await page.getByTestId('toggle-reminders').click();
await page.getByText('Đã lưu').first().waitFor();
await page.getByTestId('toggle-notifications').click();
await page.getByRole('button', { name: 'Gửi thông báo thử' }).waitFor();
ok('notifications can be enabled', await page.getByTestId('toggle-notifications').isChecked());
const shown = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Gửi thông báo thử').click();
  await new Promise((r) => setTimeout(r, 800));
  return (await reg.getNotifications()).map((n) => n.title + ' | ' + n.body);
});
ok('test notification shown via service worker', shown.some((s) => s.includes('Thông báo đang hoạt động')), shown.join(' / '));

// Reminder notifier: sample account always has an unlogged lunch or water/InBody reminder at some hour;
// force it by setting all meal reminders to 00:00 and reloading.
await page.evaluate(() => localStorage.removeItem('ntvn_notified_v1'));
for (const lbl of ['Nhắc nếu chưa ghi bữa sáng lúc', 'Nhắc nếu chưa ghi bữa trưa lúc', 'Nhắc nếu chưa ghi bữa tối lúc']) await page.getByLabel(lbl).fill('00:00');
await page.getByRole('button', { name: 'Lưu', exact: true }).click();
await page.getByText('Đã lưu').first().waitFor();
await page.waitForTimeout(1500);
const reminders = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'ntvn-reminder' })).map((n) => n.title + ' | ' + n.body));
ok('due reminders become a device notification', reminders.length === 1 && /Chưa ghi/.test(reminders[0]), reminders.join(' / '));
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ntvn_notified_v1') || 'null'));
ok('notified reminders remembered for the day (no repeats)', stored && stored.ids.length > 0, JSON.stringify(stored));
await page.screenshot({ path: `${OUT}/alerts-settings-mobile.png`, fullPage: true });

// Mobile layout: no horizontal overflow
for (const p of ['/', '/settings']) {
  await page.goto(BASE + p); await page.waitForTimeout(400);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`no horizontal overflow on ${p}`, over <= 0, `${over}px`);
}
ok('no uncaught page errors', errors.length === 0, errors.join(' | '));

// Desktop screenshot
const d = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const dp = await d.newPage();
await dp.goto(BASE + '/login');
await dp.getByLabel('Email').fill('demo@nutritrack.vn');
await dp.getByLabel('Mật khẩu', { exact: true }).fill('demo1234');
await dp.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
await dp.waitForURL(BASE + '/');
await dp.getByText('Cảnh báo & nhắc nhở').first().waitFor();
await dp.waitForTimeout(400);
await dp.screenshot({ path: `${OUT}/alerts-dashboard-desktop.png`, fullPage: true });
await dp.goto(BASE + '/settings'); await dp.waitForTimeout(400);
await dp.screenshot({ path: `${OUT}/alerts-settings-desktop.png`, fullPage: true });

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
