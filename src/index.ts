import 'dotenv/config';
import express from 'express';
import { middleware, messagingApi, webhook } from '@line/bot-sdk';
import { saveContact } from './firebase';
import { handleListCommand, handlePriceCommand, HELP_TEXT, isPriceCommand } from './price-handler';

const app = express();

const lineMiddleware = middleware({
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
});

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

// ponytail: per-instance memory, so each Cloud Run instance records an id once; name changes show up after a restart
const recorded = new Set<string>();

// Saves who talked to the bot to d2r-traderie, so their ids can be picked as price alert recipients
async function recordContact(source?: webhook.Source) {
  const id = source?.type === 'user' ? source.userId : source?.type === 'group' ? source.groupId : source?.type === 'room' ? source.roomId : undefined;
  if (!source || !id || recorded.has(id)) return;
  try {
    // Rooms have no name lookup; a failed lookup (e.g. the user blocked the bot) still records the id
    const name =
      source.type === 'user' ? await client.getProfile(id).then((p) => p.displayName, () => null)
      : source.type === 'group' ? await client.getGroupSummary(id).then((g) => g.groupName, () => null)
      : null;
    await saveContact({ id, type: source.type, name });
    recorded.add(id);
  } catch (err) {
    console.error('record contact failed', id, err);
  }
}

app.post('/webhook', lineMiddleware, async (req, res) => {
  try {
    const events: webhook.Event[] = req.body.events;
    // Awaited with the replies: Cloud Run may throttle CPU once the response is sent
    await Promise.all([
      ...events.map((event) => recordContact(event.source)),
      ...events.map(async (event) => {
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
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('webhook error', err);
    res.status(500).json({ ok: false });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`d2r-linebot listening on :${port}`));
