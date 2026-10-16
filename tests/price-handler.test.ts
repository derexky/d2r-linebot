import { parseCommand, formatResponse, handlePriceCommand, isPriceCommand, resolveItem } from '../src/price-handler';
import { PriceSnapshot } from '../src/firebase';

jest.mock('../src/firebase');
import { getLatestSnapshot, getTrackedNames } from '../src/firebase';
const mockGetLatest = getLatestSnapshot as jest.MockedFunction<typeof getLatestSnapshot>;

describe('parseCommand', () => {
  it('parses item name only — defaults to sc ladder', () => {
    expect(parseCommand('/price ber rune')).toEqual({ item: 'ber rune', mode: 'sc', ladder: true });
  });

  it('nonladder flag sets ladder=false', () => {
    expect(parseCommand('/price ber rune nonladder')).toEqual({ item: 'ber rune', mode: 'sc', ladder: false });
  });

  it('ladder flag is ignored (default is already ladder)', () => {
    expect(parseCommand('/price ber rune ladder')).toEqual({ item: 'ber rune', mode: 'sc', ladder: true });
  });

  it('parses hc flag', () => {
    expect(parseCommand('/price ber rune hc')).toEqual({ item: 'ber rune', mode: 'hc', ladder: true });
  });

  it('parses hc and nonladder flags in either order', () => {
    expect(parseCommand('/price ber rune hc nonladder')).toEqual({ item: 'ber rune', mode: 'hc', ladder: false });
    expect(parseCommand('/price ber rune nonladder hc')).toEqual({ item: 'ber rune', mode: 'hc', ladder: false });
  });

  it('returns null when no item remains after stripping flags', () => {
    expect(parseCommand('/price')).toBeNull();
    expect(parseCommand('/price hc')).toBeNull();
    expect(parseCommand('/price nonladder')).toBeNull();
    expect(parseCommand('/price hc nonladder')).toBeNull();
  });

  it('keeps single-word items as typed (rune names are resolved later)', () => {
    expect(parseCommand('/price jah')).toEqual({ item: 'jah', mode: 'sc', ladder: true });
    expect(parseCommand('/p 謎團 hc')).toEqual({ item: '謎團', mode: 'hc', ladder: true });
  });
});

describe('isPriceCommand', () => {
  it('matches /p and /price followed by a space or the end', () => {
    expect(isPriceCommand('/p ber')).toBe(true);
    expect(isPriceCommand('/price ber')).toBe(true);
    expect(isPriceCommand('/p')).toBe(true);
  });

  it('ignores other commands starting with /p', () => {
    expect(isPriceCommand('/ping')).toBe(false);
    expect(isPriceCommand('/pricey')).toBe(false);
    expect(isPriceCommand('hi /p ber')).toBe(false);
  });
});

describe('resolveItem', () => {
  const names = { 'Ber Rune': '貝', Shako: '諧角之冠', Enigma: '謎團' };

  it('matches English names case-insensitively', () => {
    expect(resolveItem('shako', names)).toBe('Shako');
    expect(resolveItem('BER RUNE', names)).toBe('Ber Rune');
  });

  it('matches Chinese names', () => {
    expect(resolveItem('謎團', names)).toBe('Enigma');
    expect(resolveItem('貝', names)).toBe('Ber Rune');
  });

  it('appends Rune for rune names', () => {
    expect(resolveItem('ber', names)).toBe('Ber Rune');
  });

  it('returns untracked names as typed', () => {
    expect(resolveItem('nope', names)).toBe('nope');
  });
});

describe('formatResponse', () => {
  const snapshot: PriceSnapshot = {
    synced_at: { _seconds: 1749600000 },
    price: {
      count: 42,
      top: [
        { items: [{ name: 'Jah Rune', quantity: 1 }], freq: 15 },
        { items: [{ name: 'Ohm', quantity: 1 }, { name: 'Vex', quantity: 1 }], freq: 8 },
        { items: [{ name: 'Ist', quantity: 2 }], freq: 5 },
      ],
    },
    trade_window: {
      earliest: { _seconds: 1749427200 },
      latest: { _seconds: 1749600000 },
    },
  };

  it('includes item name and mode label in header', () => {
    const result = formatResponse('Ber Rune', true, 'sc', snapshot);
    expect(result).toContain('📊 Ber Rune | Ladder SC');
  });

  it('shows sample count', () => {
    const result = formatResponse('Ber Rune', true, 'sc', snapshot);
    expect(result).toContain('樣本: 42 筆');
  });

  it('formats single-item price entry', () => {
    const result = formatResponse('Ber Rune', true, 'sc', snapshot);
    expect(result).toContain('#1  Jah Rune — 15次');
  });

  it('joins multi-item price with " + "', () => {
    const result = formatResponse('Ber Rune', true, 'sc', snapshot);
    expect(result).toContain('#2  Ohm + Vex — 8次');
  });

  it('prefixes quantity when > 1', () => {
    const result = formatResponse('Ber Rune', true, 'sc', snapshot);
    expect(result).toContain('#3  2× Ist — 5次');
  });

  it('shows non-ladder label for ladder=false', () => {
    const result = formatResponse('Ber Rune', false, 'sc', snapshot);
    expect(result).toContain('Non-Ladder SC');
  });

  it('shows HC label for hc mode', () => {
    const result = formatResponse('Ber Rune', true, 'hc', snapshot);
    expect(result).toContain('Ladder HC');
  });

  it('shows times relative to now, independent of server timezone', () => {
    const now = 1749600000 * 1000 + 23 * 60000; // 23 minutes after synced_at
    const result = formatResponse('Ber Rune', true, 'sc', snapshot, now);
    expect(result).toContain('更新: 23 分鐘前');
    expect(result).toContain('成交區間: 2 天前 – 23 分鐘前');
  });

  it('uses 剛剛 / hours for recent and same-day times', () => {
    const s = { ...snapshot, trade_window: { earliest: { _seconds: 1749600000 - 5 * 3600 }, latest: { _seconds: 1749600000 } } };
    const result = formatResponse('Ber Rune', true, 'sc', s, 1749600000 * 1000 + 30000);
    expect(result).toContain('更新: 剛剛');
    expect(result).toContain('成交區間: 5 小時前 – 剛剛');
  });

  it('caps entries at 10', () => {
    const bigSnap: PriceSnapshot = {
      price: {
        count: 100,
        top: Array.from({ length: 15 }, (_, i) => ({
          items: [{ name: `Item${i}`, quantity: 1 }],
          freq: 15 - i,
        })),
      },
    };
    const result = formatResponse('x', false, 'sc', bigSnap);
    expect(result).toContain('#10  ');
    expect(result).not.toContain('#11  ');
  });

  it('returns not-found message when snapshot is null', () => {
    const result = formatResponse('ber rune', false, 'sc', null);
    expect(result).toBe('找不到「ber rune」的價格資料（non-ladder SC）');
  });
});

describe('handlePriceCommand', () => {
  beforeEach(() => {
    mockGetLatest.mockReset();
    (getTrackedNames as jest.MockedFunction<typeof getTrackedNames>).mockResolvedValue({ 'Ber Rune': '貝' });
  });

  it('returns usage hint when no item name provided', async () => {
    const result = await handlePriceCommand('/price');
    expect(result).toContain('用法');
    expect(mockGetLatest).not.toHaveBeenCalled();
  });

  it('resolves item name case-insensitively', async () => {
    mockGetLatest.mockResolvedValue({
      price: { count: 5, top: [{ items: [{ name: 'Jah', quantity: 1 }], freq: 3 }] },
    });
    const result = await handlePriceCommand('/price ber rune');
    expect(mockGetLatest).toHaveBeenCalledWith('Ber Rune', true, 'sc');
    expect(result).toContain('#1  Jah — 3次');
  });

  it('defaults to ladder=true', async () => {
    mockGetLatest.mockResolvedValue({ price: { count: 1, top: [] } });
    await handlePriceCommand('/price ber rune');
    expect(mockGetLatest).toHaveBeenCalledWith('Ber Rune', true, 'sc');
  });

  it('returns error message when the price lookup throws', async () => {
    mockGetLatest.mockRejectedValue(new Error('network'));
    const result = await handlePriceCommand('/price ber rune');
    expect(result).toBe('查詢失敗，請稍後再試');
  });
});
