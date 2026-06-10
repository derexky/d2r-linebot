import { getLatestSnapshot, PriceSnapshot, Mode } from './firebase';

export interface ParsedCommand {
  item: string;
  mode: Mode;
  ladder: boolean;
}

export function parseCommand(text: string): ParsedCommand | null {
  const rest = text.slice('/price'.length).trim();
  if (!rest) return null;

  const tokens = rest.split(/\s+/);
  const lower = tokens.map((t) => t.toLowerCase());
  const ladder = lower.includes('ladder');
  const hc = lower.includes('hc');

  const itemTokens = tokens.filter((_, i) => lower[i] !== 'ladder' && lower[i] !== 'hc');
  const item = itemTokens.join(' ').trim();
  if (!item) return null;

  return { item, mode: hc ? 'hc' : 'sc', ladder };
}

function tsToStr(ts?: { _seconds: number }): string {
  if (!ts) return '—';
  return new Date(ts._seconds * 1000).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatResponse(
  item: string,
  ladder: boolean,
  mode: Mode,
  snapshot: PriceSnapshot | null,
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
    `樣本: ${count} 筆 | 更新: ${tsToStr(snapshot.synced_at)}`,
    '',
    ...lines,
    '',
    `成交區間: ${tsToStr(snapshot.trade_window?.earliest)} – ${tsToStr(snapshot.trade_window?.latest)}`,
  ].join('\n');
}

export async function handlePriceCommand(text: string): Promise<string> {
  const parsed = parseCommand(text);
  if (!parsed) {
    return '用法：/price <物品名稱> [hc] [ladder]\n例如：/price ber rune ladder';
  }
  try {
    const snapshot = await getLatestSnapshot(parsed.item, parsed.ladder, parsed.mode);
    return formatResponse(parsed.item, parsed.ladder, parsed.mode, snapshot);
  } catch {
    return '查詢失敗，請稍後再試';
  }
}
