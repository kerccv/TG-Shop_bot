// index.js
require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Инициализация переменных из .env
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

// Middleware для парсинга JSON
app.use(express.json());
app.use(express.static('webapp')); // Папка с мини-приложением

// Обработчик вебхука Telegram
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res).catch(err => {
    console.error('Ошибка в handleUpdate:', err);
    res.sendStatus(500);
  });
});

// Пример команды
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

// Запуск сервера и настройка вебхука
app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);

  const url = `https://${process.env.RENDER_EXTERNAL_URL || 'lavandershopbot.onrender.com'}/bot${BOT_TOKEN}`;
  try {
    await bot.telegram.setWebhook(url);
    console.log('Webhook установлен:', url);
  } catch (err) {
    console.error('Ошибка установки webhook:', err);
  }
});
