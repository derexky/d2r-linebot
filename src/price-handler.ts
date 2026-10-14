import { getLatestSnapshot, PriceSnapshot, Mode } from './firebase';
import { TRACKED_ITEMS } from './tracked-items';

export interface ParsedCommand {
  item: string;
  mode: Mode;
  ladder: boolean;
}

export function parseCommand(text: string): ParsedCommand | null {
  const prefix = text.startsWith('/price') ? '/price' : '/p';
  const rest = text.slice(prefix.length).trim();
  if (!rest) return null;

  const tokens = rest.split(/\s+/);
  const lower = tokens.map((t) => t.toLowerCase());
  const nonladder = lower.includes('nonladder');
  const hc = lower.includes('hc');

  const itemTokens = tokens.filter((_, i) => lower[i] !== 'ladder' && lower[i] !== 'nonladder' && lower[i] !== 'hc');
  let item = itemTokens.join(' ').trim();
  if (!item) return null;
  if (itemTokens.length === 1) item = `${item} Rune`;

  return { item, mode: hc ? 'hc' : 'sc', ladder: !nonladder };
}

// Relative time: LINE doesn't tell us the user's timezone, and Cloud Run runs in UTC
function ago(ts: { _seconds: number } | undefined, now: number): string {
  if (!ts) return '—';
  const min = Math.floor((now - ts._seconds * 1000) / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} 小時前`;
  return `${Math.floor(min / (24 * 60))} 天前`;
}

export function formatResponse(
  item: string,
  ladder: boolean,
  mode: Mode,
  snapshot: PriceSnapshot | null,
  now = Date.now(),
): string {
  if (!snapshot) {
    const combo = `${ladder ? 'ladder' : 'non-ladder'} ${mode.toUpperCase()}`;
    return `找不到「${item}」的價格資料（${combo}）`;
  }

  const modeLabel = `${ladder ? 'Ladder' : 'Non-Ladder'} ${mode.toUpperCase()}`;
  const count = snapshot.price?.count ?? 0;
  const top = (snapshot.price?.top ?? []).slice(0, 10);

  const lines = top.map((entry, i) => {
    const priceStr = entry.items
      .map((it) => (it.quantity > 1 ? `${it.quantity}× ${it.name}` : it.name))
      .join(' + ');
    return `#${i + 1}  ${priceStr} — ${entry.freq}次`;
  });

  return [
    `📊 ${item} | ${modeLabel}`,
    `樣本: ${count} 筆 | 更新: ${ago(snapshot.synced_at, now)}`,
    '',
    ...lines,
    '',
    `成交區間: ${ago(snapshot.trade_window?.earliest, now)} – ${ago(snapshot.trade_window?.latest, now)}`,
  ].join('\n');
}

export const HELP_TEXT = `📖 D2R Rune Price Bot 指令說明

/p <符文> — 查詢符文價格（預設 Ladder SC）
/p <符文> hc — Hardcore
/p <符文> nonladder — Non-Ladder
/p <符文> hc nonladder — HC Non-Ladder

範例：
  /p ber
  /p JAH hc
  /p Sur nonladder

符文名稱不分大小寫`;

export async function handlePriceCommand(text: string): Promise<string> {
  const parsed = parseCommand(text);
  if (!parsed) {
    return '用法：/price <物品名稱> [hc] [nonladder]\n例如：/price ber rune';
  }
  try {
    const resolved = TRACKED_ITEMS.find((i) => i.toLowerCase() === parsed.item.toLowerCase()) ?? parsed.item;
    const snapshot = await getLatestSnapshot(resolved, parsed.ladder, parsed.mode);
    return formatResponse(resolved, parsed.ladder, parsed.mode, snapshot);
  } catch {
    return '查詢失敗，請稍後再試';
  }
}
