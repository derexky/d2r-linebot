const TRADERIE_URL = process.env.TRADERIE_URL ?? 'http://localhost:7432';

export type Mode = 'sc' | 'hc';

export interface PriceItem {
  name: string;
  quantity: number;
}

export interface PriceSnapshot {
  synced_at?: { _seconds: number };
  price?: {
    count: number;
    top: { items: PriceItem[]; freq: number }[];
  };
  trade_window?: {
    earliest?: { _seconds: number };
    latest?: { _seconds: number };
  };
}

const SNAPSHOT_CACHE = new Map<string, { data: PriceSnapshot | null; ts: number }>();
const SNAPSHOT_TTL = 10 * 60 * 1000;

// English → Chinese name of every tracked item with price data, managed in d2r-traderie (via d2r-admin)
let trackedCache: { data: Record<string, string>; ts: number } | null = null;

export async function getTrackedNames(): Promise<Record<string, string>> {
  if (trackedCache && Date.now() - trackedCache.ts < SNAPSHOT_TTL) return trackedCache.data;
  const res = await fetch(`${TRADERIE_URL}/api/prices/groups`, {
    headers: { 'x-api-token': process.env.TRADERIE_TOKEN ?? '' },
  });
  if (!res.ok) throw new Error(`traderie groups: HTTP ${res.status}`);
  const groups = (await res.json()) as { zh: Record<string, string> }[];
  trackedCache = { data: Object.assign({}, ...groups.map((g) => g.zh)), ts: Date.now() };
  return trackedCache.data;
}

export async function getLatestSnapshot(
  item: string,
  ladder: boolean,
  mode: Mode,
): Promise<PriceSnapshot | null> {
  const combo = `${ladder ? 'ladder' : 'nonladder'}_${mode}`;
  const key = `${item}|${combo}`;
  const cached = SNAPSHOT_CACHE.get(key);
  if (cached && Date.now() - cached.ts < SNAPSHOT_TTL) return cached.data;

  const params = new URLSearchParams({ item, ladder: String(ladder), mode });
  const res = await fetch(`${TRADERIE_URL}/api/prices/latest?${params}`, {
    headers: { 'x-api-token': process.env.TRADERIE_TOKEN ?? '' },
  });
  if (!res.ok) throw new Error(`traderie latest: HTTP ${res.status}`);
  const text = await res.text();
  const data = text ? (JSON.parse(text) as PriceSnapshot) : null;
  SNAPSHOT_CACHE.set(key, { data, ts: Date.now() });
  return data;
}
