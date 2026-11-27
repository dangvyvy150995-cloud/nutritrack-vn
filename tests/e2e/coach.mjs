// E2E checks for PT (coach) mode: invite code, client joins via code and via link, PT dashboard,
// read-only client detail, client disconnects. Demo mode by default; with LIVE=1 it runs against the
// Supabase project in .env.local (needs migration 0003 and "Confirm email" off).
// Run: npm run build && npx vite preview --port 4173 & node tests/e2e/coach.mjs [baseUrl]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.env.SHOTS || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const stamp = Date.now().toString(36);
const PT = { email: `ntvn.e2e.pt.${stamp}@example.com`, pw: 'pt-pass-1234', name: 'PT Minh' };
const CL = { email: `ntvn.e2e.client.${stamp}@example.com`, pw: 'client-pass-1234', name: 'Học viên Lan' };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

const register = async (u) => {
  await page.goto(BASE + '/register');
  await page.getByLabel('Họ và tên').fill(u.name);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(u.pw);
  await page.getByLabel('Xác nhận mật khẩu').fill(u.pw);
  await page.getByRole('button', { name: 'Đăng ký' }).click();
  await page.waitForURL(BASE + '/');
};
const login = async (u) => {
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(u.pw);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
};
const logout = async () => { await page.getByRole('button', { name: 'Đăng xuất' }).first().click(); await page.waitForURL(BASE + '/login'); };

// 1. Client account with some data (registered first so the PT is a separate user).
await register(CL);
await page.goto(BASE + '/settings');
await page.getByTestId('my-coach-card').waitFor();
ok('client settings shows "PT của tôi" card', await page.getByText('Bạn chưa kết nối với PT nào').isVisible());
await logout();

// 2. PT turns on PT mode.
await register(PT);
ok('PT nav hidden before PT mode', (await page.getByRole('link', { name: 'Học viên (PT)' }).count()) === 0);
await page.goto(BASE + '/coach');
await page.getByTestId('coach-name').fill('Coach Minh');
await page.getByRole('button', { name: 'Bật chế độ PT' }).click();
await page.getByTestId('invite-code').waitFor();
const code = (await page.getByTestId('invite-code').innerText()).trim();
ok('PT gets a 6-character invite code', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);
ok('PT nav visible after PT mode', await page.getByRole('link', { name: 'Học viên (PT)' }).first().isVisible());
ok('empty client list message', await page.getByText('Chưa có học viên nào').isVisible());
await logout();

// 3. Client joins with the code.
await login(CL);
await page.waitForURL(BASE + '/');
await page.goto(BASE + '/settings');
await page.getByTestId('invite-code-input').fill('ZZZZZZ');
await page.getByRole('button', { name: 'Tiếp tục' }).click();
await page.getByText('Mã mời không đúng').waitFor();
ok('wrong code rejected', true);
await page.getByTestId('invite-code-input').fill(code.toLowerCase());
await page.getByRole('button', { name: 'Tiếp tục' }).click();
await page.getByTestId('join-confirm').waitFor();
ok('confirmation names the PT', await page.getByText('Kết nối với PT Coach Minh?').isVisible());
ok('confirmation lists what is shared', await page.getByText('PT sẽ được XEM').isVisible());
await page.getByRole('button', { name: 'Đồng ý kết nối' }).click();
await page.getByTestId('my-coach-linked').waitFor();
ok('client is linked', (await page.getByTestId('my-coach-linked').innerText()).includes('Coach Minh'));

// Client logs food (today, way over the default goal) and a measurement.
await page.goto(BASE + '/goals');
await page.waitForTimeout(500);
const applyBtn = page.getByRole('button', { name: /Lưu/ }).first();
if (await applyBtn.isVisible().catch(() => false)) await applyBtn.click().catch(() => undefined);
await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Thêm chỉ số cơ thể' }).click();
await page.getByLabel(/Cân nặng/).first().fill('72');
await page.getByLabel(/Chiều cao/).first().fill('165');
await page.getByRole('dialog').getByRole('button', { name: 'Lưu' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Thêm món nhanh' }).click();
await page.getByRole('dialog').getByRole('textbox').first().fill('com trang');
await page.getByRole('dialog').getByText('Cơm trắng', { exact: false }).first().click();
await page.waitForTimeout(300);
await page.getByRole('dialog').getByRole('button', { name: /^Thêm/ }).last().click();
await page.waitForTimeout(500);
await logout();

// 4. PT dashboard and read-only detail.
await login(PT);
await page.waitForURL(BASE + '/');
await page.goto(BASE + '/coach');
await page.getByTestId('client-card').first().waitFor();
const card = page.getByTestId('client-card').first();
const cardText = await card.innerText();
ok('PT sees the client on the dashboard', cardText.includes(CL.name), cardText.replace(/\n/g, ' | '));
ok('client card shows today\'s logging', /bữa đã ghi hôm nay|Chưa ghi bữa nào hôm nay/.test(cardText));
ok('client card shows weight & BMI', cardText.includes('72 kg') && cardText.includes('BMI 26.4'));
ok('client card shows flags', (await card.locator('[data-code]').count()) > 0, (await card.locator('[data-code]').evaluateAll((els) => els.map((e) => e.getAttribute('data-code')))).join(','));
await page.screenshot({ path: `${OUT}/coach-dashboard-desktop.png`, fullPage: true });
await card.click();
await page.getByTestId('client-detail').waitFor();
ok('detail shows read-only notice', await page.getByText('Chỉ xem: dữ liệu do học viên tự ghi').isVisible());
ok('detail shows diary entries', (await page.getByTestId('client-diary').innerText()).includes('Cơm'));
ok('detail shows measurement history', (await page.getByTestId('client-measurements').locator('tbody tr').count()) === 1);
ok('detail has no edit/delete/add controls', (await page.getByTestId('client-detail').getByRole('button', { name: /^(Sửa|Xóa|Thêm món nhanh|Thêm chỉ số cơ thể)$/ }).count()) === 0);
await page.screenshot({ path: `${OUT}/coach-client-detail-desktop.png`, fullPage: true });
await page.setViewportSize({ width: 412, height: 915 });
await page.goto(BASE + '/coach');
await page.getByTestId('client-card').first().waitFor();
await page.screenshot({ path: `${OUT}/coach-dashboard-mobile.png`, fullPage: true });
await page.setViewportSize({ width: 1280, height: 900 });
// PT's own diary does not include the client's entries.
await page.goto(BASE + '/diary');
await page.waitForTimeout(800);
ok('PT\'s own diary does not show client food', (await page.getByText('Cơm trắng').count()) === 0);
await logout();

// 5. Invite link while logged out → login → confirmation page.
await page.goto(BASE + `/join?code=${code}`);
await page.waitForURL(BASE + '/login');
await login(CL);
await page.waitForURL((u) => u.pathname === '/join');
await page.getByText('Lời mời từ PT').first().waitFor();
ok('invite link survives sign-in and opens the join page', await page.getByText(/đang chia sẻ dữ liệu với PT Coach Minh/).isVisible());

// 6. Client disconnects → PT loses access.
await page.goto(BASE + '/settings');
await page.getByRole('button', { name: 'Huỷ kết nối' }).click();
await page.getByText('Bạn chưa kết nối với PT nào').waitFor();
ok('client can disconnect', true);
await logout();
await login(PT);
await page.waitForURL(BASE + '/');
await page.goto(BASE + '/coach');
await page.getByText('Chưa có học viên nào').waitFor();
ok('after disconnect the PT no longer lists the client', true);

ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
