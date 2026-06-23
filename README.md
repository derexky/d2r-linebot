# d2r-linebot

易牙居 Diablo II: Resurrected LINE Bot，提供符文及裝備即時價格查詢。

## 功能

- 接收 LINE Webhook，解析 `/p` 或 `/price` 指令
- 從 Firestore 讀取價格快照並回傳格式化結果
- 支援 Ladder / Non-Ladder、SC / HC 四種模式

## 指令

```
/p <物品>              查詢價格（預設 Ladder SC）
/p <物品> hc           Hardcore
/p <物品> nonladder    Non-Ladder
/p <物品> hc nonladder HC Non-Ladder
/help                  顯示說明
```

## 技術棧

- **語言**：TypeScript + Express
- **資料庫**：Firestore（Firebase Admin SDK）
- **部署**：Cloud Run（asia-east1）

## 開發

```bash
npm install
npm run dev
```

## 部署

```bash
gcloud run deploy d2r-linebot --source . --project=d2r-diablo --region=asia-east1 --no-allow-unauthenticated
```

## 注意

`src/tracked-items.ts` 與 `d2r-traderie` 的同名檔案需保持同步，新增追蹤物品時兩邊都要更新。
