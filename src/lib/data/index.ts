import type { Backend } from './backend';
import { DemoBackend } from './demo';
import { SupabaseBackend } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True only when real Supabase credentials were provided at build time. */
export const SUPABASE_CONFIGURED = !!(url && key && /^https?:\/\//.test(url) && !url.includes('YOUR-PROJECT'));

export const backend: Backend = SUPABASE_CONFIGURED ? new SupabaseBackend(url!, key!) : new DemoBackend();
export * from './backend';
