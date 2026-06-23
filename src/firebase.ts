import * as admin from 'firebase-admin';

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

function ensureInit() {
  if (!admin.apps.length) admin.initializeApp();
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

  ensureInit();
  const snap = await admin
    .firestore()
    .collection('price_snapshots')
    .doc(item)
    .collection(combo)
    .orderBy('synced_at', 'desc')
    .limit(1)
    .get();
  const data = snap.empty ? null : (snap.docs[0].data() as PriceSnapshot);
  SNAPSHOT_CACHE.set(key, { data, ts: Date.now() });
  return data;
}
