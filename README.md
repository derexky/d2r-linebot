# d2r-linebot

易牙居 Diablo II: Resurrected LINE Bot，提供符文及裝備即時價格查詢。

## 功能

- 接收 LINE Webhook，解析 `/p` 或 `/price` 指令
- 從 d2r-traderie API 讀取價格快照並回傳格式化結果
- 支援 Ladder / Non-Ladder、SC / HC 四種模式
- 記錄互動過的好友／群組（id + 名稱）到 d2r-traderie 的 `line_contacts`，供低價通知選收件人

## 指令

```
/p <物品>              查詢價格（預設 Ladder SC），/price 亦可
/p <物品> hc           Hardcore
/p <物品> nl           Non-Ladder（nonladder 亦可）
/p <物品> hc nl        HC Non-Ladder
/l                     列出可查價物品，/list 亦可
/help                  顯示說明，/h 亦可
```

物品可用英文（不分大小寫）或中文名稱，符文可省略 `Rune`（`/p ber`、`/p 謎團`、`/p shako`）。對不到完整名稱時會找包含輸入文字的物品：只有一個就直接查，多個則列出候選（`/p 喬丹`、`/p 之怒`）。也支援常見縮寫：cta、coh、hoto、botd、soj、anni、wf、hoz、wt（`src/price-handler.ts` 的 `ALIASES`）。

## 技術棧

- **語言**：TypeScript + Express
- **資料來源**：d2r-traderie `GET /api/prices/latest`（`TRADERIE_URL`，預設 `http://localhost:7432`）
- **部署**：Cloud Run（asia-east1）

## 開發

```bash
npm install
npm run dev
```

## 部署

```bash
gcloud run deploy d2r-linebot --source . --project=d2r-diablo --region=asia-east1
# 首次部署需設定：--update-env-vars TRADERIE_URL=https://traderie.derexky.com,TRADERIE_TOKEN=...
# 不要加 --no-allow-unauthenticated，LINE webhook 需要公開存取
```

## 注意

追蹤物品清單由 d2r-traderie 管理（d2r-admin「TR 價格追蹤物品」頁），bot 透過 `/api/prices/groups` 取得（含中文名稱），不用另外同步。
