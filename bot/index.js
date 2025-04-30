import express from "express";
import path from "path";
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.resolve();

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL;

bot.start((ctx) => {
  ctx.reply("Добро пожаловать! Открой мини-приложение:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Открыть магазин",
            web_app: { url: WEBAPP_URL }
          }
        ]
      ]
    }
  });
});

app.use("/webapp", express.static(path.join(__dirname, "webapp")));

app.use(express.json());
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);

  try {
    const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/bot${process.env.BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log("Webhook установлен:", webhookUrl);
  } catch (err) {
    console.error("Ошибка установки webhook:", err);
  }
});
