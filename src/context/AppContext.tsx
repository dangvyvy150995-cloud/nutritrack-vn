import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FitnessGoals, FoodCategory, FoodItem, Language, Macros, UserProfile, UserSettings } from '@/types';
import { backend, type AuthUser } from '@/lib/data';
import { DICTS, type DictKey } from '@/i18n/dict';
import { FoodSearchIndex } from '@/lib/calc/search';
import { DEFAULT_TZ, todayIso } from '@/lib/calc/dates';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }

interface Ctx {
  backend: typeof backend;
  ready: boolean;
  user: AuthUser | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  goals: FitnessGoals | null;
  isAdmin: boolean;
  lang: Language;
  tz: string;
  today: string;
  t: (k: DictKey, vars?: Record<string, string | number>) => string;
  setLang: (l: Language) => void;
  foods: FoodItem[];
  foodsLoading: boolean;
  foodIndex: FoodSearchIndex;
  foodById: Map<string, FoodItem>;
  categories: FoodCategory[];
  favorites: Set<string>;
  toggleFavorite: (id: string) => Promise<void>;
  reloadFoods: () => Promise<void>;
  reloadUserData: () => Promise<void>;
  setProfile: (p: UserProfile) => void;
  setSettings: (s: UserSettings) => void;
  setGoals: (g: FitnessGoals) => void;
  goalMacros: Macros | null;
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  dataVersion: number; // bump to make pages refetch (e.g. after quick-add)
  bump: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

const LANG_KEY = 'ntvn_lang';
function initialLang(): Language {
  try { const v = localStorage.getItem(LANG_KEY); if (v === 'en' || v === 'vi') return v; } catch { /* ignore */ }
  return 'vi';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettingsState] = useState<UserSettings | null>(null);
  const [goals, setGoals] = useState<FitnessGoals | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lang, setLangState] = useState<Language>(initialLang);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [foodsLoading, setFoodsLoading] = useState(false);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const toastId = useRef(0);

  const t = useCallback((k: DictKey, vars?: Record<string, string | number>) => {
    let s: string = DICTS[lang][k] ?? DICTS.vi[k] ?? k;
    if (vars) for (const [vk, vv] of Object.entries(vars)) s = s.replace(`{${vk}}`, String(vv));
    return s;
  }, [lang]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts, { id, kind, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3500);
  }, []);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
    document.documentElement.lang = l;
    if (user) backend.saveSettings({ language: l }).then(setSettingsState).catch(() => undefined);
  }, [user]);

  const reloadFoods = useCallback(async () => {
    setFoodsLoading(true);
    try {
      const [f, c, fav] = await Promise.all([backend.listFoods(), backend.listCategories(), backend.listFavorites()]);
      setFoods(f); setCategories(c); setFavorites(new Set(fav));
    } finally { setFoodsLoading(false); }
  }, []);

  const reloadUserData = useCallback(async () => {
    const [p, s, g, a] = await Promise.all([backend.getProfile(), backend.getSettings(), backend.getGoals(), backend.isAdmin()]);
    setProfile(p); setSettingsState(s); setGoals(g); setIsAdmin(a);
    if (s.language && s.language !== lang) { setLangState(s.language); try { localStorage.setItem(LANG_KEY, s.language); } catch { /* ignore */ } }
  }, [lang]);

  useEffect(() => {
    let alive = true;
    let currentId: string | null | undefined;
    const load = async (u: AuthUser | null) => {
      currentId = u?.id ?? null;
      setUser(u);
      if (!u) { setProfile(null); setSettingsState(null); setGoals(null); setIsAdmin(false); setFoods([]); setReady(true); return; }
      try {
        await reloadUserData();
        reloadFoods().catch((e) => toast(String(e.message ?? e), 'error'));
      } catch (e) {
        toast((e as Error).message, 'error');
      } finally { if (alive) setReady(true); }
    };
    // Supabase fires INITIAL_SESSION/SIGNED_IN as well as resolving getUser(); load each user only once,
    // otherwise a second profile fetch can land while a page is already being edited.
    const loadIfChanged = (u: AuthUser | null) => { if (currentId === undefined || (u?.id ?? null) !== currentId) load(u); };
    backend.getUser().then(loadIfChanged);
    const off = backend.onAuthChange(loadIfChanged);
    return () => { alive = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const toggleFavorite = useCallback(async (id: string) => {
    const fav = !favorites.has(id);
    setFavorites((s) => { const n = new Set(s); if (fav) n.add(id); else n.delete(id); return n; });
    try { await backend.setFavorite(id, fav); } catch (e) { toast((e as Error).message, 'error'); }
  }, [favorites, toast]);

  const foodIndex = useMemo(() => new FoodSearchIndex(foods), [foods]);
  const foodById = useMemo(() => new Map(foods.map((f) => [f.food_id, f])), [foods]);
  const tz = settings?.timezone || DEFAULT_TZ;
  const goalMacros = goals ? { calories: goals.calories_kcal, protein: goals.protein_g, carbs: goals.carbs_g, fat: goals.fat_g, fiber: goals.fiber_g } : null;

  const value: Ctx = {
    backend, ready, user, profile, settings, goals, isAdmin, lang, tz, today: todayIso(tz), t, setLang,
    foods, foodsLoading, foodIndex, foodById, categories, favorites, toggleFavorite, reloadFoods, reloadUserData,
    setProfile, setSettings: setSettingsState, setGoals, goalMacros, toasts, toast, dataVersion, bump: () => setDataVersion((v) => v + 1),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}
