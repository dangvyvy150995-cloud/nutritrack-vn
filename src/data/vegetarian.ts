/**
 * NutriTrack VN – vegetarian / vegan ("món chay") foods with cited sources.
 *
 * Every ingredient value below is copied from the USDA National Nutrient
 * Database for Standard Reference, Release 28 (the dataset FoodData Central
 * publishes as "SR Legacy"), identified by its NDB number. Values are per
 * 100 g edible portion. Search the NDB number at https://fdc.nal.usda.gov to
 * see the record.
 *
 * - Single-ingredient foods map 1:1 to a USDA record → VERIFIED (the record
 *   is cited in data_source).
 * - Composed dishes (phở chay, cơm tấm chay…) have no reference record. They
 *   are calculated from a stated recipe portion, ingredient by ingredient,
 *   and stay ESTIMATED; data_source lists every ingredient, its grams and its
 *   NDB number so anyone can recheck the arithmetic.
 *
 * The Vietnamese National Food Composition Table (Viện Dinh dưỡng Quốc gia)
 * was not reachable when this file was written, so it is not cited here.
 */
import type { FoodItem, FoodServing, PreparationMethod, RawOrCooked } from '@/types';

export interface UsdaRef { ndb: string; name: string; kcal: number; p: number; c: number; f: number; fib: number }

/** USDA SR28 / SR Legacy records used here (per 100 g). */
export const USDA = {
  water: { ndb: '', name: 'Water', kcal: 0, p: 0, c: 0, f: 0, fib: 0 },
  rice: { ndb: '20045', name: 'Rice, white, long-grain, regular, enriched, cooked', kcal: 130, p: 2.69, c: 28.17, f: 0.28, fib: 0.4 },
  glutinous: { ndb: '20055', name: 'Rice, white, glutinous, unenriched, cooked', kcal: 97, p: 2.02, c: 21.09, f: 0.19, fib: 1 },
  rice_noodle: { ndb: '20134', name: 'Rice noodles, cooked', kcal: 108, p: 1.79, c: 24.01, f: 0.2, fib: 1 },
  pasta: { ndb: '20121', name: 'Pasta, cooked, enriched, without added salt', kcal: 158, p: 5.8, c: 30.86, f: 0.93, fib: 1.8 },
  bread: { ndb: '18029', name: 'Bread, french or vienna (includes sourdough)', kcal: 272, p: 10.75, c: 51.88, f: 2.42, fib: 2.2 },
  rice_flour: { ndb: '20061', name: 'Rice flour, white, unenriched', kcal: 366, p: 5.95, c: 80.13, f: 1.42, fib: 2.4 },
  tofu: { ndb: '16427', name: 'Tofu, raw, regular, prepared with calcium sulfate', kcal: 76, p: 8.08, c: 1.87, f: 4.78, fib: 0.3 },
  tofu_firm: { ndb: '16426', name: 'Tofu, raw, firm, prepared with calcium sulfate', kcal: 144, p: 17.27, c: 2.78, f: 8.72, fib: 2.3 },
  tofu_fried: { ndb: '16429', name: 'Tofu, fried, prepared with calcium sulfate', kcal: 270, p: 18.82, c: 8.86, f: 20.18, fib: 3.9 },
  tofu_soft: { ndb: '16127', name: 'Tofu, soft, prepared with calcium sulfate and magnesium chloride (nigari)', kcal: 61, p: 7.17, c: 1.18, f: 3.69, fib: 0.2 },
  tempeh: { ndb: '16114', name: 'Tempeh', kcal: 192, p: 20.29, c: 7.64, f: 10.8, fib: 0 },
  vital_gluten: { ndb: '48052', name: 'Vital wheat gluten', kcal: 370, p: 75.16, c: 13.79, f: 1.85, fib: 0.6 },
  tvp: { ndb: '16106', name: 'Meat extender', kcal: 311, p: 41.71, c: 34.71, f: 2.97, fib: 17.5 },
  meatless_slices: { ndb: '43131', name: 'Luncheon slices, meatless', kcal: 189, p: 17.78, c: 4.44, f: 11.11, fib: 1.1 },
  chickpea: { ndb: '16057', name: 'Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt', kcal: 164, p: 8.86, c: 27.42, f: 2.59, fib: 7.6 },
  black_bean: { ndb: '16015', name: 'Beans, black, mature seeds, cooked, boiled, without salt', kcal: 132, p: 8.86, c: 23.71, f: 0.54, fib: 8.7 },
  lentil: { ndb: '16070', name: 'Lentils, mature seeds, cooked, boiled, without salt', kcal: 116, p: 9.02, c: 20.13, f: 0.38, fib: 7.9 },
  mung: { ndb: '16081', name: 'Mung beans, mature seeds, cooked, boiled, without salt', kcal: 105, p: 7.02, c: 19.15, f: 0.38, fib: 7.6 },
  soybean: { ndb: '16109', name: 'Soybeans, mature cooked, boiled, without salt', kcal: 172, p: 18.21, c: 8.36, f: 8.97, fib: 6 },
  edamame: { ndb: '11212', name: 'Edamame, frozen, prepared', kcal: 121, p: 11.91, c: 8.91, f: 5.2, fib: 5.2 },
  soymilk_unsw: { ndb: '16222', name: 'Soymilk (all flavors), unsweetened, with added calcium, vitamins A and D', kcal: 33, p: 2.86, c: 1.74, f: 1.61, fib: 0.5 },
  soymilk_sweet: { ndb: '16120', name: 'Soymilk, original and vanilla, unfortified', kcal: 54, p: 3.27, c: 6.28, f: 1.75, fib: 0.6 },
  oyster_mush: { ndb: '11987', name: 'Mushrooms, oyster, raw', kcal: 33, p: 3.31, c: 6.09, f: 0.41, fib: 2.3 },
  straw_mush: { ndb: '11989', name: 'Mushrooms, straw, canned, drained solids', kcal: 32, p: 3.83, c: 4.64, f: 0.68, fib: 2.5 },
  shiitake: { ndb: '11238', name: 'Mushrooms, shiitake, raw', kcal: 34, p: 2.24, c: 6.79, f: 0.49, fib: 2.5 },
  enoki: { ndb: '11950', name: 'Mushrooms, enoki, raw', kcal: 37, p: 2.66, c: 7.81, f: 0.29, fib: 2.7 },
  water_spinach: { ndb: '11503', name: 'Swamp cabbage, (skunk cabbage), raw', kcal: 19, p: 2.6, c: 3.14, f: 0.2, fib: 2.1 },
  tomato: { ndb: '11529', name: 'Tomatoes, red, ripe, raw, year round average', kcal: 18, p: 0.88, c: 3.89, f: 0.2, fib: 1.2 },
  sprouts: { ndb: '11043', name: 'Mung beans, mature seeds, sprouted, raw', kcal: 30, p: 3.04, c: 5.94, f: 0.18, fib: 1.8 },
  cabbage: { ndb: '11109', name: 'Cabbage, raw', kcal: 25, p: 1.28, c: 5.8, f: 0.1, fib: 2.5 },
  carrot: { ndb: '11124', name: 'Carrots, raw', kcal: 41, p: 0.93, c: 9.58, f: 0.24, fib: 2.8 },
  daikon: { ndb: '11430', name: 'Radishes, oriental, raw', kcal: 18, p: 0.6, c: 4.1, f: 0.1, fib: 1.6 },
  onion: { ndb: '11282', name: 'Onions, raw', kcal: 40, p: 1.1, c: 9.34, f: 0.1, fib: 1.7 },
  scallion: { ndb: '11291', name: 'Onions, spring or scallions (includes tops and bulb), raw', kcal: 32, p: 1.83, c: 7.34, f: 0.19, fib: 2.6 },
  garlic: { ndb: '11215', name: 'Garlic, raw', kcal: 149, p: 6.36, c: 33.06, f: 0.5, fib: 2.1 },
  ginger: { ndb: '11216', name: 'Ginger root, raw', kcal: 80, p: 1.82, c: 17.77, f: 0.75, fib: 2 },
  lemongrass: { ndb: '11972', name: 'Lemon grass (citronella), raw', kcal: 99, p: 1.82, c: 25.31, f: 0.49, fib: 0 },
  cucumber: { ndb: '11205', name: 'Cucumber, with peel, raw', kcal: 15, p: 0.65, c: 3.63, f: 0.11, fib: 0.5 },
  lettuce: { ndb: '11251', name: 'Lettuce, cos or romaine, raw', kcal: 17, p: 1.23, c: 3.29, f: 0.3, fib: 2.1 },
  cilantro: { ndb: '11165', name: 'Coriander (cilantro) leaves, raw', kcal: 23, p: 2.13, c: 3.67, f: 0.52, fib: 2.8 },
  potato: { ndb: '11367', name: 'Potatoes, boiled, cooked without skin, flesh, without salt', kcal: 86, p: 1.71, c: 20.01, f: 0.1, fib: 1.8 },
  sweet_potato: { ndb: '11508', name: 'Sweet potato, cooked, baked in skin, flesh, without salt', kcal: 90, p: 2.01, c: 20.71, f: 0.15, fib: 3.3 },
  oil: { ndb: '04044', name: 'Oil, soybean, salad or cooking', kcal: 884, p: 0, c: 0, f: 100, fib: 0 },
  sugar: { ndb: '19335', name: 'Sugars, granulated', kcal: 387, p: 0, c: 99.98, f: 0, fib: 0 },
  soy_sauce: { ndb: '16123', name: 'Soy sauce made from soy and wheat (shoyu)', kcal: 53, p: 8.14, c: 4.93, f: 0.57, fib: 0.8 },
  hoisin: { ndb: '06175', name: 'Sauce, hoisin, ready-to-serve', kcal: 220, p: 3.31, c: 44.08, f: 3.39, fib: 2.8 },
  peanut: { ndb: '16390', name: 'Peanuts, all types, dry-roasted, without salt', kcal: 587, p: 24.35, c: 21.26, f: 49.66, fib: 8.4 },
  cashew: { ndb: '12085', name: 'Nuts, cashew nuts, dry roasted, without salt added', kcal: 574, p: 15.31, c: 32.69, f: 46.35, fib: 3 },
  coconut_milk: { ndb: '12118', name: 'Nuts, coconut milk, canned (liquid expressed from grated meat and water)', kcal: 197, p: 2.02, c: 2.81, f: 21.33, fib: 0 },
  chia: { ndb: '12006', name: 'Seeds, chia seeds, dried', kcal: 486, p: 16.54, c: 42.12, f: 30.74, fib: 34.4 },
  flax: { ndb: '12220', name: 'Seeds, flaxseed', kcal: 534, p: 18.29, c: 28.88, f: 42.16, fib: 27.3 },
  sesame: { ndb: '12023', name: 'Seeds, sesame seeds, whole, dried', kcal: 573, p: 17.73, c: 23.45, f: 49.67, fib: 11.8 },
  chili: { ndb: '11819', name: 'Peppers, hot chili, red, raw', kcal: 40, p: 1.87, c: 8.81, f: 0.44, fib: 1.5 },
} satisfies Record<string, UsdaRef>;

type Key = keyof typeof USDA;

/** Vietnamese label for each ingredient, used in the recipe breakdown. */
const VI: Record<Key, string> = {
  water: 'nước', rice: 'cơm trắng', glutinous: 'xôi nếp', rice_noodle: 'bún/bánh phở chín', pasta: 'mì sợi lúa mì chín (không trứng)',
  bread: 'bánh mì', rice_flour: 'bánh tráng (tính như bột gạo khô)', tofu: 'đậu hũ trắng', tofu_firm: 'đậu hũ cứng', tofu_fried: 'đậu hũ chiên',
  tofu_soft: 'đậu hũ non', tempeh: 'tempeh', vital_gluten: 'bột gluten lúa mì', tvp: 'đạm đậu nành khô (TVP)',
  meatless_slices: 'chả lụa chay (tính như chả chay đóng gói)', chickpea: 'đậu gà luộc', black_bean: 'đậu đen luộc', lentil: 'đậu lăng luộc',
  mung: 'đậu xanh nấu chín', soybean: 'đậu nành luộc', edamame: 'đậu nành Nhật (edamame)', soymilk_unsw: 'sữa đậu nành không đường',
  soymilk_sweet: 'sữa đậu nành', oyster_mush: 'nấm bào ngư', straw_mush: 'nấm rơm', shiitake: 'nấm đông cô', enoki: 'nấm kim châm',
  water_spinach: 'rau muống', tomato: 'cà chua', sprouts: 'giá', cabbage: 'bắp cải', carrot: 'cà rốt', daikon: 'củ cải trắng',
  onion: 'hành tây', scallion: 'hành lá', garlic: 'tỏi', ginger: 'gừng', lemongrass: 'sả', cucumber: 'dưa leo', lettuce: 'xà lách',
  cilantro: 'rau thơm', potato: 'khoai tây', sweet_potato: 'khoai lang', oil: 'dầu ăn', sugar: 'đường', soy_sauce: 'nước tương',
  hoisin: 'tương đen (hoisin)', peanut: 'đậu phộng rang', cashew: 'hạt điều rang', coconut_milk: 'nước cốt dừa', sesame: 'mè',
  chili: 'ớt', chia: 'hạt chia', flax: 'hạt lanh',
};

type Item = [Key, number];
interface Dish {
  slug: string; vi: string; en: string; alt: string;
  prep: PreparationMethod; roc: RawOrCooked; unit_vi: string; unit_en: string; sub: string;
  /** Ingredients for ONE serving, grams as eaten. */
  items: Item[];
  /** Extra assumption worth stating (e.g. how a proxy was chosen). */
  note?: string;
}
interface Single {
  slug: string; vi: string; en: string; alt: string; key: Key;
  prep: PreparationMethod; roc: RawOrCooked; serving: number; unit_vi: string; unit_en: string; sub: string;
  note?: string; status?: 'VERIFIED' | 'ESTIMATED';
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Total macros of a list of ingredient portions. */
export function sumItems(items: Item[]) {
  let g = 0, kcal = 0, p = 0, c = 0, f = 0, fib = 0;
  for (const [k, grams] of items) {
    const u = USDA[k]; const x = grams / 100;
    g += grams; kcal += u.kcal * x; p += u.p * x; c += u.c * x; f += u.f * x; fib += u.fib * x;
  }
  return { grams: g, kcal, p, c, f, fib };
}

const cite = (k: Key) => (USDA[k].ndb ? `USDA ${USDA[k].ndb}` : '0 kcal');

/** Single-ingredient foods: values are the USDA record itself. */
const SINGLES: Single[] = [
  { slug: 'tempeh', vi: 'Tempeh (đậu nành lên men)', en: 'Tempeh', alt: 'tempeh|đậu nành lên men', key: 'tempeh', prep: 'none', roc: 'prepared', serving: 100, unit_vi: 'miếng', unit_en: 'piece', sub: 'protein' },
  { slug: 'dau-hu-non', vi: 'Đậu hũ non', en: 'Soft tofu', alt: 'tàu hũ non|đậu phụ non|silken tofu|soft tofu', key: 'tofu_soft', prep: 'none', roc: 'prepared', serving: 150, unit_vi: 'hộp', unit_en: 'pack', sub: 'protein' },
  { slug: 'dau-ga-luoc', vi: 'Đậu gà luộc', en: 'Chickpeas, boiled', alt: 'đậu gà|đậu răng ngựa|chickpeas|garbanzo', key: 'chickpea', prep: 'boiled', roc: 'cooked', serving: 165, unit_vi: 'chén', unit_en: 'cup', sub: 'legumes' },
  { slug: 'edamame', vi: 'Đậu nành Nhật (edamame) luộc', en: 'Edamame, cooked', alt: 'edamame|đậu nành rau|đậu nành non', key: 'edamame', prep: 'boiled', roc: 'cooked', serving: 100, unit_vi: 'chén (bóc vỏ)', unit_en: 'cup (shelled)', sub: 'legumes' },
  { slug: 'nam-rom-chin', vi: 'Nấm rơm (đóng hộp, ráo nước)', en: 'Straw mushrooms, canned, drained', alt: 'nấm rơm hộp', key: 'straw_mush', prep: 'processed', roc: 'cooked', serving: 100, unit_vi: 'phần', unit_en: 'portion', sub: 'mushroom' },
  { slug: 'gluten-bot', vi: 'Bột gluten lúa mì (làm mì căn)', en: 'Vital wheat gluten', alt: 'bột mì căn|vital wheat gluten|seitan flour', key: 'vital_gluten', prep: 'none', roc: 'dry', serving: 30, unit_vi: 'phần', unit_en: 'portion', sub: 'protein' },
  { slug: 'dam-dau-nanh-kho', vi: 'Đạm đậu nành khô (TVP, sườn non chay khô)', en: 'Textured soy protein (TVP), dry', alt: 'sườn non chay khô|thịt chay khô|tvp|textured vegetable protein', key: 'tvp', prep: 'processed', roc: 'dry', serving: 25, unit_vi: 'phần', unit_en: 'portion', sub: 'protein',
    note: 'USDA ghi tên "Meat extender" (đạm đậu nành dạng sợi/miếng, khô). Sản phẩm Việt Nam khác nhau, xem nhãn bao bì.' },
  { slug: 'cha-lua-chay', vi: 'Chả lụa chay', en: 'Vegetarian sausage loaf (cha lua chay)', alt: 'giò chay|chả chay|vegetarian ham', key: 'meatless_slices', prep: 'processed', roc: 'prepared', serving: 50, unit_vi: 'lát dày', unit_en: 'thick slice', sub: 'protein', status: 'ESTIMATED',
    note: 'Không có bản ghi chả lụa chay. Dùng USDA 43131 "Luncheon slices, meatless" (chả lát chay) làm giá trị gần nhất. Chả chay Việt Nam thường nhiều tinh bột và ít đạm hơn: luôn ưu tiên nhãn bao bì.' },
];

/** Composed dishes: one serving, ingredient by ingredient. */
const DISHES: Dish[] = [
  { slug: 'mi-can', vi: 'Mì căn (seitan) luộc', en: 'Seitan (wheat gluten), simmered', alt: 'mì căn|mì cân|seitan|wheat meat', prep: 'boiled', roc: 'cooked', unit_vi: 'phần', unit_en: 'portion', sub: 'protein',
    items: [['vital_gluten', 33], ['water', 67]], note: 'Giả định mì căn chín gồm 1 phần bột gluten và 2 phần nước theo khối lượng; mì căn càng khô thì đạm/100 g càng cao.' },
  { slug: 'suon-non-chay-chien', vi: 'Sườn non chay chiên', en: 'Fried vegetarian "ribs" (soy protein)', alt: 'sườn chay|sườn non chay|soy ribs', prep: 'fried', roc: 'cooked', unit_vi: 'phần (2–3 miếng)', unit_en: 'portion', sub: 'protein',
    items: [['tvp', 20], ['water', 40], ['oil', 5]], note: '20 g sườn chay khô ngâm nở gấp 3 lần, chiên thấm khoảng 5 g dầu.' },
  { slug: 'com-tam-chay', vi: 'Cơm tấm chay (sườn non chay)', en: 'Vegetarian broken rice with soy "ribs"', alt: 'cơm tấm chay|cơm sườn chay', prep: 'prepared', roc: 'prepared', unit_vi: 'đĩa', unit_en: 'plate', sub: 'rice_dish',
    items: [['rice', 200], ['tvp', 20], ['water', 40], ['oil', 8], ['scallion', 5], ['cucumber', 30], ['carrot', 15], ['daikon', 15], ['soy_sauce', 10], ['sugar', 10], ['water', 15]],
    note: 'Gồm 200 g cơm, 2–3 miếng sườn chay (20 g khô), mỡ hành, đồ chua, dưa leo, nước tương pha đường. Không tính bì chay, chả chay (thêm riêng nếu có).' },
  { slug: 'pho-chay', vi: 'Phở chay', en: 'Vegetarian pho', alt: 'phở chay|phở nấm|phở đậu hũ', prep: 'prepared', roc: 'prepared', unit_vi: 'tô', unit_en: 'bowl', sub: 'noodle_soup',
    items: [['rice_noodle', 200], ['tofu_fried', 50], ['shiitake', 30], ['oyster_mush', 30], ['sprouts', 30], ['onion', 15], ['scallion', 5], ['cilantro', 3], ['carrot', 20], ['daikon', 30], ['soy_sauce', 5], ['sugar', 3], ['water', 350]],
    note: 'Nước dùng rau củ không dầu. Quán cho nhiều đậu hũ hơn thì đạm tăng (mỗi 50 g đậu hũ chiên thêm ~9 g đạm, 135 kcal).' },
  { slug: 'bun-rieu-chay', vi: 'Bún riêu chay', en: 'Vegetarian tomato noodle soup (bun rieu chay)', alt: 'bún riêu chay', prep: 'prepared', roc: 'prepared', unit_vi: 'tô', unit_en: 'bowl', sub: 'noodle_soup',
    items: [['rice_noodle', 200], ['tofu', 60], ['tofu_fried', 50], ['tomato', 80], ['straw_mush', 30], ['oil', 5], ['sprouts', 20], ['soy_sauce', 5], ['sugar', 3], ['water', 350]],
    note: 'Riêu làm từ đậu hũ trắng tán, thêm đậu hũ chiên, cà chua xào dầu, nấm rơm.' },
  { slug: 'banh-mi-chay', vi: 'Bánh mì chay (chả lụa chay, pate nấm)', en: 'Vegetarian banh mi', alt: 'bánh mì chay', prep: 'prepared', roc: 'prepared', unit_vi: 'ổ', unit_en: 'sandwich', sub: 'bread',
    items: [['bread', 70], ['meatless_slices', 40], ['oyster_mush', 20], ['oil', 5], ['carrot', 10], ['daikon', 10], ['cucumber', 15], ['cilantro', 3], ['soy_sauce', 5], ['chili', 2]],
    note: 'Pate nấm tính là 20 g nấm xay + 5 g dầu. Chả lụa chay tính theo chả chay đóng gói của USDA (xem món Chả lụa chay).' },
  { slug: 'mi-xao-chay', vi: 'Mì xào chay rau củ', en: 'Vegetarian stir-fried noodles with vegetables', alt: 'mì xào chay|mì xào rau củ', prep: 'stir_fried', roc: 'prepared', unit_vi: 'đĩa', unit_en: 'plate', sub: 'noodle_dry',
    items: [['pasta', 200], ['tofu_fried', 40], ['cabbage', 50], ['carrot', 30], ['oyster_mush', 40], ['garlic', 3], ['oil', 10], ['soy_sauce', 10]],
    note: 'Dùng mì sợi lúa mì không trứng. Mì trứng không phải món thuần chay.' },
  { slug: 'com-chien-chay', vi: 'Cơm chiên chay', en: 'Vegetarian fried rice', alt: 'cơm chiên chay|cơm rang chay', prep: 'fried', roc: 'prepared', unit_vi: 'đĩa', unit_en: 'plate', sub: 'rice_dish',
    items: [['rice', 200], ['tofu_fried', 30], ['edamame', 20], ['carrot', 20], ['scallion', 5], ['oil', 10], ['soy_sauce', 8]] },
  { slug: 'dau-sot-ca', vi: 'Đậu hũ chiên sốt cà chua', en: 'Fried tofu in tomato sauce', alt: 'đậu sốt cà|đậu phụ sốt cà chua|tofu tomato', prep: 'braised', roc: 'cooked', unit_vi: 'đĩa', unit_en: 'plate', sub: 'tofu',
    items: [['tofu_fried', 120], ['tomato', 100], ['oil', 7], ['scallion', 5], ['sugar', 3], ['soy_sauce', 5]] },
  { slug: 'dau-hu-kho-nam', vi: 'Đậu hũ kho nấm', en: 'Tofu braised with mushrooms', alt: 'đậu kho nấm|đậu hũ kho', prep: 'braised', roc: 'cooked', unit_vi: 'phần', unit_en: 'portion', sub: 'tofu',
    items: [['tofu_fried', 100], ['shiitake', 40], ['oil', 5], ['soy_sauce', 10], ['sugar', 5], ['water', 30]] },
  { slug: 'mi-can-kho-sa', vi: 'Mì căn kho sả ớt', en: 'Seitan braised with lemongrass & chili', alt: 'mì căn kho|mì căn xào sả', prep: 'braised', roc: 'cooked', unit_vi: 'phần', unit_en: 'portion', sub: 'protein',
    items: [['vital_gluten', 33], ['water', 67], ['oil', 7], ['soy_sauce', 10], ['sugar', 5], ['lemongrass', 5], ['chili', 2]],
    note: '100 g mì căn (1 phần bột gluten : 2 phần nước) kho với dầu, nước tương, đường, sả.' },
  { slug: 'tempeh-ap-chao', vi: 'Tempeh áp chảo', en: 'Pan-seared tempeh', alt: 'tempeh chiên|tempeh rán', prep: 'pan_seared', roc: 'cooked', unit_vi: 'phần', unit_en: 'portion', sub: 'protein',
    items: [['tempeh', 100], ['oil', 5], ['soy_sauce', 5]] },
  { slug: 'goi-cuon-chay', vi: 'Gỏi cuốn chay (kèm tương đậu phộng)', en: 'Vegetarian fresh spring roll with peanut-hoisin sauce', alt: 'gỏi cuốn chay|cuốn chay', prep: 'raw', roc: 'prepared', unit_vi: 'cuốn', unit_en: 'roll', sub: 'rolls',
    items: [['rice_flour', 9], ['rice_noodle', 30], ['tofu_fried', 20], ['lettuce', 10], ['cilantro', 3], ['carrot', 5], ['sprouts', 5], ['hoisin', 8], ['peanut', 3]],
    note: 'Tính cho 1 cuốn. Bánh tráng 9 g khô tính như bột gạo trắng (USDA không có bánh tráng).' },
  { slug: 'canh-nam-dau-hu', vi: 'Canh nấm đậu hũ', en: 'Mushroom & tofu soup', alt: 'canh đậu hũ nấm|canh chay', prep: 'boiled', roc: 'prepared', unit_vi: 'tô', unit_en: 'bowl', sub: 'soup',
    items: [['tofu', 80], ['straw_mush', 30], ['enoki', 30], ['tomato', 30], ['scallion', 3], ['oil', 2], ['soy_sauce', 3], ['water', 250]] },
  { slug: 'canh-rau-cu-chay', vi: 'Canh rau củ chay', en: 'Vegetable soup', alt: 'canh rau củ|canh chay', prep: 'boiled', roc: 'prepared', unit_vi: 'tô', unit_en: 'bowl', sub: 'soup',
    items: [['carrot', 40], ['potato', 50], ['cabbage', 50], ['daikon', 40], ['oil', 2], ['soy_sauce', 3], ['water', 250]] },
  { slug: 'nam-xao-chay', vi: 'Nấm xào chay', en: 'Stir-fried mixed mushrooms', alt: 'nấm xào|nấm xào tỏi', prep: 'stir_fried', roc: 'cooked', unit_vi: 'đĩa', unit_en: 'plate', sub: 'vegetable',
    items: [['oyster_mush', 80], ['shiitake', 40], ['enoki', 30], ['garlic', 3], ['oil', 8], ['soy_sauce', 5]] },
  { slug: 'ca-ri-chay', vi: 'Cà ri chay', en: 'Vegetarian coconut curry', alt: 'cà ri chay|curry chay', prep: 'braised', roc: 'prepared', unit_vi: 'tô', unit_en: 'bowl', sub: 'curry',
    items: [['potato', 80], ['sweet_potato', 60], ['carrot', 40], ['tofu_fried', 60], ['coconut_milk', 60], ['lemongrass', 5], ['oil', 5], ['soy_sauce', 5], ['water', 100]],
    note: 'Không tính bánh mì hoặc bún ăn kèm.' },
  { slug: 'sua-dau-nanh-hat-chia', vi: 'Sữa đậu nành không đường + hạt chia', en: 'Unsweetened soy milk with chia seeds', alt: 'sữa đậu chia', prep: 'beverage', roc: 'n/a', unit_vi: 'ly', unit_en: 'glass', sub: 'drink',
    items: [['soymilk_unsw', 250], ['chia', 10]], note: 'Sữa đậu nành có bổ sung canxi, vitamin A, D (USDA 16222).' },
];

/**
 * Existing seed records whose values are replaced by the matching USDA
 * record (and therefore become VERIFIED). Their categories stay the same.
 */
export const USDA_UPGRADES: Record<string, Key> = {
  'dau-phu': 'tofu', 'dau-phu-cung': 'tofu_firm', 'dau-hu-chien': 'tofu_fried', 'sua-dau-nanh-khong-duong': 'soymilk_unsw',
  'dau-nanh-luoc': 'soybean', 'dau-den-luoc': 'black_bean', 'gia': 'sprouts', 'nuoc-tuong': 'soy_sauce', 'tuong-den': 'hoisin', 'dau-an': 'oil', 'dau-xanh-luoc': 'mung', 'dau-lang-luoc': 'lentil', 'rau-muong': 'water_spinach',
  'hat-dieu': 'cashew', 'dau-phong-rang': 'peanut', 'hat-chia': 'chia', 'hat-lanh': 'flax', 'me-trang': 'sesame', 'com-trang': 'rice',
};

/** Existing plant-only seed records that also get the "chay" tag. */
export const EXISTING_VEGAN = [
  ...Object.keys(USDA_UPGRADES), 'com-gao-lut', 'xoi-trang', 'xoi-dau-xanh', 'bun-tuoi', 'banh-pho-tuoi', 'hu-tieu-tuoi', 'banh-cuon-trang', 'banh-mi-khong',
  'khoai-lang-luoc', 'khoai-tay-luoc', 'bap-luoc', 'yen-mach', 'sua-dau-nanh-co-duong', 'dau-xanh-kho', 'dau-lang-kho', 'rau-muong-luoc', 'rau-muong-xao-toi', 'gia',
  'nam-kim-cham', 'nam-dui-ga', 'nam-huong-tuoi', 'nam-huong-kho', 'nam-rom', 'nam-bao-ngu', 'che-dau-xanh', 'che-dau-den', 'tau-hu-nuoc-duong',
  'plant-protein', 'bo-dau-phong', 'dau-phong-song', 'me-den',
];

/**
 * Earlier seed records that a calculated dish above replaces in place (same
 * food_id, so diary history keeps pointing at it).
 */
export const REPLACES_EXISTING = ['dau-sot-ca'];

export const VEG_TAG = 'chay';
export const VEG_CATEGORY = { id: 'vegetarian', code: 'P', name_vi: 'Món chay', name_en: 'Vegetarian & vegan', sort_order: 16 } as const;

export function usdaSource(k: Key, note?: string): string {
  const u = USDA[k];
  return `USDA FoodData Central – SR Legacy (SR28), NDB ${u.ndb} "${u.name}", giá trị/100 g.${note ? ` ${note}` : ''}`;
}

/** Breakdown text: "cơm trắng 200 g (USDA 20045) + …". */
function breakdown(d: Dish): string {
  const merged = new Map<Key, number>();
  for (const [k, g] of d.items) merged.set(k, (merged.get(k) ?? 0) + g);
  return [...merged].map(([k, g]) => `${VI[k]} ${r1(g)} g (${cite(k)})`).join(' + ');
}

export interface VegDishSummary { slug: string; vi: string; serving_label: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; fiber: number; breakdown: string; note?: string; status: 'VERIFIED' | 'ESTIMATED'; source: string }

function makeFood(base: { slug: string; vi: string; en: string; alt: string; prep: PreparationMethod; roc: RawOrCooked; sub: string },
  per100: { kcal: number; p: number; c: number; f: number; fib: number }, serving: number, unit_vi: string, unit_en: string,
  source: string, status: 'VERIFIED' | 'ESTIMATED', ts: string): FoodItem {
  const servings: FoodServing[] = [{ id: `${base.slug}--default`, food_id: base.slug, label_vi: `1 ${unit_vi}`, label_en: `1 ${unit_en}`, grams: serving, is_default: true }];
  return {
    food_id: base.slug, food_name_vi: base.vi, food_name_en: base.en,
    alternative_names: base.alt.split('|').map((s) => s.trim()).filter(Boolean),
    search_keywords: [VEG_CATEGORY.id, VEG_TAG, base.sub, base.prep, base.roc],
    category: VEG_CATEGORY.id, subcategory: base.sub,
    calories_kcal: Math.round(per100.kcal), protein_g: r1(per100.p), carbs_g: r1(per100.c), fat_g: r1(per100.f), fiber_g: r1(per100.fib),
    serving_size: serving, serving_unit: base.prep === 'beverage' ? 'ml' : 'g',
    preparation_method: base.prep, raw_or_cooked: base.roc, edible_portion: 1,
    data_source: source, verification_status: status, owner_id: null, created_at: ts, updated_at: ts, servings,
  };
}

export const VEG_TIMESTAMP = '2026-11-27T00:00:00.000Z';

export const VEG_SUMMARY: VegDishSummary[] = [];

export const VEGETARIAN_FOODS: FoodItem[] = [
  ...SINGLES.map((s) => {
    const u = USDA[s.key]; const status = s.status ?? 'VERIFIED';
    const source = status === 'VERIFIED' ? usdaSource(s.key, s.note) : `ƯỚC TÍNH – ${usdaSource(s.key, s.note)}`;
    const x = s.serving / 100;
    VEG_SUMMARY.push({ slug: s.slug, vi: s.vi, serving_label: `1 ${s.unit_vi}`, grams: s.serving, kcal: u.kcal * x, protein: u.p * x, carbs: u.c * x, fat: u.f * x, fiber: u.fib * x, breakdown: `${VI[s.key]} ${s.serving} g (USDA ${u.ndb})`, note: s.note, status, source });
    return makeFood(s, u, s.serving, s.unit_vi, s.unit_en, source, status, VEG_TIMESTAMP);
  }),
  ...DISHES.map((d) => {
    const t = sumItems(d.items); const g = t.grams; const k = 100 / g;
    const source = `ƯỚC TÍNH – tính từ công thức 1 ${d.unit_vi} ${r1(g)} g: ${breakdown(d)}. Tổng 1 ${d.unit_vi}: ${Math.round(t.kcal)} kcal, ${r1(t.p)} g đạm. Số liệu nguyên liệu: USDA FoodData Central – SR Legacy (SR28), theo mã NDB.${d.note ? ` ${d.note}` : ''} Thực tế thay đổi theo quán, khẩu phần và lượng dầu.`;
    VEG_SUMMARY.push({ slug: d.slug, vi: d.vi, serving_label: `1 ${d.unit_vi}`, grams: g, kcal: t.kcal, protein: t.p, carbs: t.c, fat: t.f, fiber: t.fib, breakdown: breakdown(d), note: d.note, status: 'ESTIMATED', source });
    return makeFood(d, { kcal: t.kcal * k, p: t.p * k, c: t.c * k, f: t.f * k, fib: t.fib * k }, r1(g), d.unit_vi, d.unit_en, source, 'ESTIMATED', VEG_TIMESTAMP);
  }),
];
