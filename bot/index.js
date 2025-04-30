require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();

// === Переменные окружения ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(id => id.trim());
const PORT = process.env.PORT || 10000;

if (!BOT_TOKEN || !PUBLIC_URL) {
  throw new Error('BOT_TOKEN и PUBLIC_URL обязательны в .env');
}

const bot = new Telegraf(BOT_TOKEN);

// === Обработка команд бота ===
bot.start((ctx) => {
  ctx.reply('Добро пожаловать!', {
    reply_markup: {
      inline_keyboard: [[{
        text: '🛍 Перейти в магазин',
        web_app: { url: `${PUBLIC_URL}/webapp/index.html` }
      }]]
    }
  });

  if (ADMIN_IDS?.includes(String(ctx.from.id))) {
    ctx.reply('Панель администратора: 🔧');
  }
});

// === Webhook-путь ===
const WEBHOOK_PATH = '/bot-webhook';
bot.telegram.setWebhook(`${PUBLIC_URL}${WEBHOOK_PATH}`);
app.use(bot.webhookCallback(WEBHOOK_PATH));

// === Подключаем мини-приложение ===
app.use('/webapp', express.static(path.join(__dirname, 'webapp')));

// === Проверочный маршрут ===
app.get('/', (req, res) => {
  res.send('✅ Lavander & Sleep работает');
});

// === Запуск сервера ===
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
