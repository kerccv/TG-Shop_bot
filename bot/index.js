require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const {
  BOT_TOKEN,
  SUPABASE_URL,
  SUPABASE_KEY,
  ADMIN_IDS,
  WEBAPP_URL,
} = process.env;

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('webapp'));

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res).catch(err => {
    console.error('Ошибка в handleUpdate:', err);
    res.sendStatus(500);
  });
});

bot.command('start', (ctx) => {
  ctx.reply('Добро пожаловать! Открой мини-приложение:', {
    reply_markup: {
      inline_keyboard: [[
        {
          text: '🛍 Перейти в магазин',
          web_app: { url: WEBAPP_URL }
        }
      ]]
    }
  });
});

app.listen(PORT, async () => {
  const baseUrl = 'https://tg-shop-bot-gw2h.onrender.com';
  const webhookUrl = `${baseUrl}/bot${BOT_TOKEN}`;

  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log('Webhook установлен:', webhookUrl);
  } catch (err) {
    console.error('Ошибка установки webhook:', err);
  }

  console.log(`Сервер запущен на порту ${PORT}`);
});
