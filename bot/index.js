const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// ==== Telegram bot logic ====
bot.start((ctx) => {
  ctx.reply('Добро пожаловать!', {
    reply_markup: {
      keyboard: [['🛍 Открыть магазин']],
      resize_keyboard: true,
    }
  });
});

bot.hears('🛍 Открыть магазин', (ctx) => {
  const url = 'https://lavandershopbot.onrender.com/webapp/index.html';
  ctx.reply('Открываю магазин...', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Перейти в магазин', url }]]
    }
  });
});

bot.launch();

// ==== Webapp ====
const PORT = process.env.PORT || 3000;

app.use('/webapp', express.static(path.join(__dirname, 'webapp')));

app.get('/', (req, res) => {
  res.send('Бот работает!');
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
