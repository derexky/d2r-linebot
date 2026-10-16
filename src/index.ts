import 'dotenv/config';
import express from 'express';
import { middleware, messagingApi, webhook } from '@line/bot-sdk';
import { handleListCommand, handlePriceCommand, HELP_TEXT, isPriceCommand } from './price-handler';

const app = express();

const lineMiddleware = middleware({
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
});

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

app.post('/webhook', lineMiddleware, async (req, res) => {
  try {
    const events: webhook.Event[] = req.body.events;
    await Promise.all(
      events.map(async (event) => {
        if (event.type !== 'message' || event.message.type !== 'text') return;
        const text = (event.message as webhook.TextMessageContent).text.trim();
        if (text === '/help' || text === '/h') {
          await client.replyMessage({
            replyToken: (event as webhook.MessageEvent).replyToken!,
            messages: [{ type: 'text', text: HELP_TEXT }],
          });
          return;
        }
        let reply: string;
        if (text === '/list' || text === '/l') reply = await handleListCommand();
        else if (isPriceCommand(text)) reply = await handlePriceCommand(text);
        else return;
        await client.replyMessage({
          replyToken: (event as webhook.MessageEvent).replyToken!,
          messages: [{ type: 'text', text: reply }],
        });
      }),
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('webhook error', err);
    res.status(500).json({ ok: false });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`d2r-linebot listening on :${port}`));
