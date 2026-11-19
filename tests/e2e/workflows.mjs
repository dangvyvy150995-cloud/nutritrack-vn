// End-to-end workflow test (demo mode). Run: node tests/e2e/workflows.mjs [baseUrl]
// Requires the app served (npm run build && npx vite preview --port 4173).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.env.SHOTS || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const visible = (loc) => loc.first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
const num = async (sel) => Number((await page.locator(sel).first().innerText()).replace(/[^\d.,-]/g, '').replace(/,/g, ''));

// 1. Registration
await page.goto(BASE + '/register');
ok('demo banner shown when Supabase not configured', await page.getByText('Chế độ demo').first().isVisible());
await page.getByLabel('Họ và tên').fill('Nguyễn Văn A');
await page.getByLabel('Email').fill('a@test.vn');
await page.getByLabel('Mật khẩu', { exact: true }).fill('password123');
await page.getByLabel('Xác nhận mật khẩu').fill('password123');
await page.getByRole('button', { name: 'Đăng ký' }).click();
await page.waitForURL(BASE + '/');
await page.getByRole('heading', { level: 1, name: /Tổng quan/ }).waitFor();
ok('1. new user registration lands on dashboard', await page.getByRole('heading', { level: 1, name: /Tổng quan/ }).isVisible());
ok('new user sees empty-state prompt to complete profile', await page.getByText('Hoàn thiện hồ sơ').isVisible());

// 3. Profile editing
await page.goto(BASE + '/profile');
await page.getByLabel('Giới tính').selectOption('male');
await page.getByLabel(/Ngày sinh/).fill('1995-03-10');
await page.getByLabel('Chiều cao (cm)').fill('172');
await page.getByLabel('Cân nặng (kg)').fill('75');
await page.getByLabel('Mức độ vận động').selectOption('moderate');
await page.getByLabel('Mục tiêu tập luyện').selectOption('fat_loss');
await page.getByRole('button', { name: 'Lưu' }).first().click();
await page.getByText('Đã lưu').first().waitFor();
await page.reload();
ok('3. profile edit persists after reload', (await page.getByLabel('Chiều cao (cm)').inputValue()) === '172');

// Goals: recommended targets
await page.goto(BASE + '/goals');
await page.getByRole('button', { name: 'Dùng giá trị gợi ý' }).click();
const kcalTarget = Number(await page.getByLabel('Calo mục tiêu (kcal)').inputValue());
// BMR male 75/172/31 = 750+1075-155+5 = 1675; TDEE ×1.55 = 2596; fat_loss −15% (cap 600) = −389 → 2207 → 2210
ok('goals: Mifflin-St Jeor recommendation matches hand calculation (2210 kcal)', kcalTarget === 2210, String(kcalTarget));
ok('goals: macros consistent message shown', await page.getByText('Đa lượng khớp với calo mục tiêu').isVisible());
await page.getByRole('button', { name: 'Lưu' }).first().click();
await page.getByText('Đã lưu').first().waitFor();

// 4–6. Diary: add foods to all four meals and verify exact totals
await page.goto(BASE + '/diary');
async function addFood(meal, query, grams) {
  const card = page.locator('section', { has: page.getByRole('heading', { name: new RegExp('^' + meal) }) });
  await card.getByRole('button', { name: 'Thêm món' }).click();
  await page.getByLabel('Tìm kiếm').fill(query);
  await page.locator('[aria-label="results"] li button').first().click();
  await page.getByRole('button', { name: /^Khối lượng|^Thể tích/ }).click();
  await page.locator('#amt').fill(String(grams));
  await page.getByRole('button', { name: /^Thêm$/ }).click();
  await page.getByText('Đã lưu').first().waitFor();
}
await addFood('Bữa sáng', 'trung luoc', 100);     // 155 kcal, P12.6 C1.1 F10.6
await addFood('Bữa trưa', 'com trang', 150);      // 195 kcal, P4.05 C42.3 F0.45 Fib0.6
await addFood('Bữa tối', 'uc ga chin', 200);      // 330 kcal, P62 F7.2
await addFood('Bữa phụ', 'chuoi', 100);           // 89 kcal, P1.1 C22.8 F0.3 Fib2.6
const totalText = await page.locator('.card').first().innerText();
const kcal = Number(totalText.match(/Năng lượng\s*([\d.,]+)/i)[1].replace(/[.,]/g, ''));
ok('4. foods added to breakfast, lunch, dinner and snacks', (await page.locator('main li').count()) >= 4);
ok('5. calorie total exact: 155+195+330+89 = 769', kcal === 769, String(kcal));
ok('6. protein total exact: 12.6+4.05+62+1.1 = 79.75 → 79.8', /Đạm\s*79[.,]8/i.test(totalText), totalText.split('\n').slice(0, 6).join(' | '));
ok('6. fiber total exact: 0.6+2.6 = 3.2', /Chất xơ\s*3[.,]2/i.test(totalText));

// "tom hap" search works without diacritics
const lunch = page.locator('section', { has: page.getByRole('heading', { name: /^Bữa trưa/ }) });
await lunch.getByRole('button', { name: 'Thêm món' }).click();
await page.getByLabel('Tìm kiếm').fill('tom hap');
ok('search "tom hap" returns "Tôm hấp" first', (await page.locator('[aria-label="results"] li').first().innerText()).startsWith('Tôm hấp'));
// serving conversion: 2 × 1 quả trứng (50 g) = 100 g → 143 kcal (raw egg)
await page.getByLabel('Tìm kiếm').fill('trung ga song');
await page.locator('[aria-label="results"] li button').first().click();
await page.locator('#qty').fill('2');
ok('serving conversion: 2 eggs × 50 g → 100 g, 143 kcal', /100 g/.test(await page.getByText('Dinh dưỡng cho').innerText()) && (await page.locator('div.tabular.text-base').first().innerText()) === '143');
await page.keyboard.press('Escape');

// 8. Edit and delete entries
const dinner = page.locator('section', { has: page.getByRole('heading', { name: /^Bữa tối/ }) });
await dinner.getByRole('button', { name: 'Sửa' }).click();
await page.locator('#amt').fill('100');
await page.getByRole('button', { name: /^Lưu$/ }).click();
await page.getByText('Đã lưu').first().waitFor();
let t2 = await page.locator('.card').first().innerText();
ok('8. edit entry: dinner 200 g → 100 g reduces total to 604', /Năng lượng\s*604/i.test(t2), t2.split('\n').slice(0, 3).join(' '));
const snack = page.locator('section', { has: page.getByRole('heading', { name: /^Bữa phụ/ }) });
await snack.getByRole('button', { name: 'Xóa' }).click();
await page.getByText('Đã xóa').first().waitFor();
t2 = await page.locator('.card').first().innerText();
ok('8. delete entry: removing banana leaves 515 kcal', /Năng lượng\s*515/i.test(t2));

// copy meals from previous day: go to tomorrow, copy "yesterday" (= today)
await page.getByLabel('Next day').click();
await page.getByRole('button', { name: 'Chép từ hôm qua' }).click();
await page.getByText(/Đã sao chép 3 món/).waitFor();
ok('copy meals from previous day (3 items)', /Năng lượng\s*515/i.test(await page.locator('.card').first().innerText()));
await page.getByLabel('Previous day').click();

// 7. Recipe creation
await page.goto(BASE + '/recipes');
await page.getByRole('button', { name: 'Công thức mới' }).first().click();
await page.getByLabel('Tên công thức *').fill('Bún hải sản test');
await page.getByLabel('Số khẩu phần *').fill('2');
for (const [q, g] of [['bun tuoi', 200], ['muc ong song', 150], ['tom the song', 100], ['cai ngot', 100], ['dau an', 5]]) {
  await page.getByRole('button', { name: 'Thêm nguyên liệu' }).click();
  await page.getByLabel('Tìm kiếm').fill(q);
  await page.locator('[aria-label="results"] li button').first().click();
  await page.getByRole('button', { name: /^Khối lượng/ }).click();
  await page.locator('#amt').fill(String(g));
  await page.getByRole('button', { name: /^Thêm$/ }).click();
}
await page.getByLabel('Khối lượng thành phẩm sau nấu (g)').fill('900');
const recipeTable = await page.locator('table').last().innerText();
// totals: 220+138+82+15+44.2 = 499.2 → 499 ; per serving 249.6 → 250 ; per 100 g (900 g) 55.5 → 55
ok('7. recipe totals: 499 kcal total, 250/serving, 55/100 g of 900 g yield', /Tổng.*\t499/.test(recipeTable) && /mỗi khẩu phần.*\t250/.test(recipeTable) && /trên 100 g\t55/.test(recipeTable), recipeTable.replace(/\n/g, ' | '));
await page.getByRole('button', { name: /^Lưu$/ }).click();
await page.getByText('Bún hải sản test').waitFor();
await page.getByRole('button', { name: 'Nhân bản' }).click();
await page.getByText('Bún hải sản test (copy)').waitFor();
ok('recipe duplicate works', await page.getByText('Bún hải sản test (copy)').isVisible());

// 9–11. Body measurements
await page.goto(BASE + '/body');
async function addMeasure(date, w, smm, bfm, pct, waist, hip) {
  await page.getByRole('button', { name: 'Thêm số đo' }).first().click();
  await page.getByLabel('Ngày đo *').fill(date);
  await page.getByLabel('Cân nặng (kg) *').fill(String(w));
  await page.getByLabel('Chiều cao (cm) *').fill('172');
  await page.getByLabel('Khối cơ xương – SMM (kg)').fill(String(smm));
  await page.getByLabel('Khối mỡ (kg)').fill(String(bfm));
  await page.getByLabel('Tỷ lệ mỡ (%)').fill(String(pct));
  await page.getByLabel('Vòng eo (cm)').fill(String(waist));
  await page.getByLabel('Vòng mông (cm)').fill(String(hip));
  const bmiText = await page.getByText(/^BMI:/).innerText();
  await page.getByRole('button', { name: /^Lưu$/ }).click();
  await page.getByText('Đã lưu').first().waitFor();
  return bmiText;
}
const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
const d = (n) => { const x = new Date(today + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
const bmi1 = await addMeasure(d(60), 78, 33.1, 18.7, 24.0, 88, 100);
await addMeasure(d(20), 76.4, 33.4, 16.8, 22.0, 85, 99);
ok('10. BMI auto-calculated: 78 kg / 172 cm = 26.4', /26[.,]4/.test(bmi1), bmi1);
const rows = await page.locator('table').last().locator('tbody tr').count();
ok('11. historical measurements preserved (profile weight record + 2 new = 3 rows)', rows === 3, `rows=${rows}`);
await page.locator('#cb').selectOption({ index: 1 });
const cmp = await page.locator('table').first().innerText();
ok('InBody comparison shows SMM +0.3 and body-fat −2', /\+0[.,]3 kg/.test(cmp) && /-2 %|−2 %|-2 %/.test(cmp.replace(/−/g, '-')), cmp.replace(/\n/g, ' | ').slice(0, 300));
// inconsistent BF validation
await page.getByRole('button', { name: 'Thêm số đo' }).first().click();
await page.getByLabel('Cân nặng (kg) *').fill('70');
await page.getByLabel('Chiều cao (cm) *').fill('172');
await page.getByLabel('Khối mỡ (kg)').fill('10');
await page.getByLabel('Tỷ lệ mỡ (%)').fill('30');
await page.getByRole('button', { name: /^Lưu$/ }).click();
ok('validation: inconsistent fat mass vs % is rejected', await page.getByText('không khớp').isVisible());
await page.keyboard.press('Escape');

// 12. Chart date filtering
await page.goto(BASE + '/progress');
await page.getByRole('tab', { name: '30 ngày' }).click();
const weightCard = page.locator('section', { has: page.getByRole('heading', { name: 'Xu hướng cân nặng' }) });
const dots30 = await weightCard.locator('.recharts-line-dot').count();
await page.getByRole('tab', { name: '3 tháng' }).click();
const dots3m = await weightCard.locator('.recharts-line-dot').count();
ok('12. chart date filter: 30 days shows fewer real points than 3 months', dots30 < dots3m && dots3m >= 2, `30d=${dots30} 3m=${dots3m}`);
await page.screenshot({ path: `${OUT}/progress-desktop.png`, fullPage: true });

// 16. CSV export
await page.goto(BASE + '/reports');
await page.getByRole('button', { name: 'Tùy chọn' }).click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Xuất nhật ký CSV' }).click()]);
const csvPath = await dl.path();
const csv = fs.readFileSync(csvPath, 'utf8');
ok('16. CSV export contains diary rows with kcal', csv.includes('date,meal,food,grams') && csv.includes('Cơm trắng') && csv.split('\n').length >= 4, csv.split('\n')[1]);

// 17. Admin permissions (regular user)
await page.goto(BASE + '/admin');
ok('17. regular user is denied admin page', await page.getByText('Chỉ quản trị viên').isVisible());
ok('17. admin link hidden from regular user', !(await page.getByRole('link', { name: 'Quản trị' }).count()));

// language switch
await page.getByRole('button', { name: 'EN' }).first().click();
ok('language switcher → English', await page.getByRole('link', { name: 'Dashboard' }).first().isVisible());
await page.getByRole('button', { name: 'VI' }).first().click();

// 2. Logout / login
await page.getByRole('button', { name: 'Đăng xuất' }).first().click();
await page.waitForURL(BASE + '/login');
ok('2. logout returns to login', true);
await page.getByLabel('Email').fill('a@test.vn');
await page.getByLabel('Mật khẩu').fill('wrongpass');
await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
ok('2. wrong password rejected', await page.getByRole('alert').isVisible());

// 13. Data isolation: second user
await page.goto(BASE + '/register');
await page.getByLabel('Họ và tên').fill('B');
await page.getByLabel('Email').fill('b@test.vn');
await page.getByLabel('Mật khẩu', { exact: true }).fill('password456');
await page.getByLabel('Xác nhận mật khẩu').fill('password456');
await page.getByRole('button', { name: 'Đăng ký' }).click();
await page.waitForURL(BASE + '/');
await page.goto(BASE + '/diary');
await visible(page.getByText('Chưa có món nào'));
ok('13. user B sees none of user A\'s diary entries', (await page.getByText('Chưa có món nào').count()) === 4);
await page.goto(BASE + '/body');
ok('13. user B sees none of user A\'s measurements', await visible(page.getByText('Chưa có số đo nào')));
await page.goto(BASE + '/recipes');
ok('13. user B sees none of user A\'s recipes', await visible(page.getByText('Chưa có công thức nào')));
await page.getByRole('button', { name: 'Đăng xuất' }).first().click();

// login back as A
await page.getByLabel('Email').fill('a@test.vn');
await page.getByLabel('Mật khẩu').fill('password123');
await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
await page.waitForURL(BASE + '/');
await page.goto(BASE + '/diary');
await visible(page.getByText('Trứng gà luộc'));
ok('2. login works and A\'s data is intact', /Năng lượng\s*515/i.test(await page.locator('.card').first().innerText()));
await page.getByRole('button', { name: 'Đăng xuất' }).first().click();

// Admin (demo sample account) – full workflow incl. verification rule
await page.getByRole('button', { name: /Đăng nhập – Dữ liệu mẫu/ }).click();
await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
await page.waitForURL(BASE + '/');
await page.screenshot({ path: `${OUT}/dashboard-desktop.png`, fullPage: true });
await page.goto(BASE + '/admin');
ok('17. admin can open admin dashboard', await visible(page.getByRole('heading', { name: /Quản trị cơ sở dữ liệu/ })));
await visible(page.getByText('food_id', { exact: false }).or(page.locator('code')));
const adminText = await page.locator('main').innerText();
ok('admin shows 503 ESTIMATED, 0 VERIFIED', /Ước tính\s*503/.test(adminText) && /Đã xác minh\s*0/.test(adminText));
await page.getByRole('button', { name: 'Đánh dấu đã xác minh' }).first().click();
await page.getByLabel('Nguồn dữ liệu').fill('');
await page.getByRole('button', { name: /^Lưu$/ }).click();
ok('admin cannot mark VERIFIED without a data source', await page.getByText('Cần nhập nguồn dữ liệu').first().isVisible());
await page.keyboard.press('Escape');
await page.screenshot({ path: `${OUT}/admin-desktop.png`, fullPage: false });

// 15. Mobile responsiveness
const m = await browser.newContext({ ...{ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
const mp = await m.newPage();
await mp.goto(BASE + '/login');
await mp.getByRole('button', { name: /Đăng nhập – Dữ liệu mẫu/ }).click();
await mp.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
await mp.waitForURL(BASE + '/');
await mp.waitForTimeout(500);
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('15. mobile: no horizontal page overflow on dashboard', overflow <= 1, `overflow=${overflow}px`);
ok('15. mobile: bottom navigation visible', await mp.locator('nav.fixed').isVisible());
await mp.screenshot({ path: `${OUT}/dashboard-mobile.png`, fullPage: true });
for (const p of ['/diary', '/progress', '/body', '/foods']) {
  await mp.goto(BASE + p); await mp.waitForTimeout(600);
  const o = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`15. mobile: no horizontal overflow on ${p}`, o <= 1, `overflow=${o}px`);
}
await mp.goto(BASE + '/diary'); await mp.waitForTimeout(400);
await mp.screenshot({ path: `${OUT}/diary-mobile.png`, fullPage: true });

ok('no uncaught page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
