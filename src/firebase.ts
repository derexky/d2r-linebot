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

function ensureInit() {
  if (!admin.apps.length) admin.initializeApp();
}

export async function getTrackedItems(): Promise<string[]> {
  ensureInit();
  const docs = await admin.firestore().collection('price_snapshots').listDocuments();
  return docs.map((d) => d.id);
}

export async function getLatestSnapshot(
  item: string,
  ladder: boolean,
  mode: Mode,
): Promise<PriceSnapshot | null> {
  ensureInit();
  const combo = `${ladder ? 'ladder' : 'nonladder'}_${mode}`;
  const snap = await admin
    .firestore()
    .collection('price_snapshots')
    .doc(item)
    .collection(combo)
    .orderBy('synced_at', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as PriceSnapshot;
}
