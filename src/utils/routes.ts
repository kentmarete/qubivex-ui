export type PageId = 'chat' | 'metrics' | 'models' | 'system' | 'settings';

export const PAGES: { id: PageId; title: string }[] = [
  { id: 'chat', title: 'Chat' },
  { id: 'metrics', title: 'Metrics' },
  { id: 'models', title: 'Models' },
  { id: 'system', title: 'System' },
  { id: 'settings', title: 'Settings' },
];

/** The app's base path, `/ui/` in production and in dev (vite `base`). */
export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export function pageFromPath(pathname: string): PageId | null {
  if (!pathname.startsWith(BASE) && pathname !== BASE.slice(0, -1)) return null;
  const rest = pathname.slice(BASE.length).replace(/\/+$/, '');
  return PAGES.find((p) => p.id === rest)?.id ?? null;
}

export function pathOf(page: PageId): string {
  return `${BASE}${page}`;
}
