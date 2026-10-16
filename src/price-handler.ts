import { getLatestSnapshot, getTrackedGroups, getTrackedNames, PriceSnapshot, Mode, TrackedGroup } from './firebase';

export interface ParsedCommand {
  item: string;
  mode: Mode;
  ladder: boolean;
}

const COMMAND = /^\/(?:price|p)(?:\s+|$)/;

// Only "/p" or "/price" followed by a space or the end, so "/ping" etc. are left alone
export function isPriceCommand(text: string): boolean {
  return COMMAND.test(text);
}

export function parseCommand(text: string): ParsedCommand | null {
  const rest = text.replace(COMMAND, '').trim();
  if (!rest) return null;

  const tokens = rest.split(/\s+/);
  const lower = tokens.map((t) => t.toLowerCase());
  const nonladder = lower.includes('nonladder') || lower.includes('nl');
  const hc = lower.includes('hc');

  const itemTokens = tokens.filter((_, i) => lower[i] !== 'ladder' && lower[i] !== 'nonladder' && lower[i] !== 'nl' && lower[i] !== 'hc');
  const item = itemTokens.join(' ').trim();
  if (!item) return null;

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

export const HELP_TEXT = `📖 D2R Price Bot 指令說明

/p <物品> — 查詢成交價（預設 Ladder SC，/price 亦可）
/p <物品> hc — Hardcore
/p <物品> nl — Non-Ladder（nonladder 亦可）
/p <物品> hc nl — HC Non-Ladder

可查符文、符文之語、暗金裝備、咒符等追蹤物品。
物品可用英文（不分大小寫）或中文名稱，符文可省略 Rune，
也可只打部分名稱（如 /p 喬丹、/p jordan）。

範例：
  /p ber
  /p 謎團 hc
  /p shako nl

/l — 列出可查價物品（/list 亦可）
/h — 顯示本說明（/help 亦可）`;

// ponytail: one message (~1.1k chars for 58 items); split per category once it nears LINE's 5000-char limit
export function formatList(groups: TrackedGroup[]): string {
  return [
    '📋 可查價物品（中文 / 英文皆可查）',
    ...groups.map((g) => [`\n【${g.category}】`, ...g.items.map((n) => `${g.zh[n]} ${n}`)].join('\n')),
  ].join('\n');
}

export async function handleListCommand(): Promise<string> {
  try {
    const groups = await getTrackedGroups();
    return groups.length ? formatList(groups) : '目前沒有可查價物品';
  } catch {
    return '查詢失敗，請稍後再試';
  }
}

// Tracked English names matching what the user typed. A full English (any case) or Chinese name, or a rune
// without " Rune", wins outright; otherwise every name whose English or Chinese contains the text
export function resolveItem(item: string, names: Record<string, string>): string[] {
  const lower = item.toLowerCase();
  const en = Object.keys(names);
  const exact =
    en.find((n) => n.toLowerCase() === lower) ??
    en.find((n) => names[n] === item) ??
    en.find((n) => n.toLowerCase() === `${lower} rune`);
  if (exact) return [exact];
  return en.filter((n) => n.toLowerCase().includes(lower) || names[n].includes(item));
}

const MAX_CANDIDATES = 10;

export async function handlePriceCommand(text: string): Promise<string> {
  const parsed = parseCommand(text);
  if (!parsed) {
    return '用法：/price <物品名稱> [hc] [nl]\n例如：/price ber rune';
  }
  try {
    const names = await getTrackedNames();
    const matches = resolveItem(parsed.item, names);
    if (!matches.length) return `找不到「${parsed.item}」，輸入 /l 查看可查價物品`;
    if (matches.length > 1) {
      return [
        `「${parsed.item}」符合多個物品，請輸入更完整的名稱：`,
        ...matches.slice(0, MAX_CANDIDATES).map((n) => `${names[n]} ${n}`),
        ...(matches.length > MAX_CANDIDATES ? [`…等 ${matches.length} 個`] : []),
      ].join('\n');
    }
    const resolved = matches[0];
    const snapshot = await getLatestSnapshot(resolved, parsed.ladder, parsed.mode);
    return formatResponse(resolved, parsed.ladder, parsed.mode, snapshot);
  } catch {
    return '查詢失敗，請稍後再試';
  }
}
