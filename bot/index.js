require("dotenv").config();
const express = require("express");
const path = require("path");
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const csvParser = require("./utils/csvParser");
const supabase = require("./utils/supabaseClient");

const app = express();
app.use('/webapp', express.static(path.join(__dirname, '../webapp')));
app.listen(process.env.PORT || 5000, () => console.log("Web server running"));

const bot = new Telegraf(process.env.BOT_TOKEN);
const adminIds = process.env.ADMIN_IDS.split(",");

bot.start(async (ctx) => {
  const isAdmin = adminIds.includes(ctx.from.id.toString());
  await ctx.reply(
    "Добро пожаловать!",
    Markup.keyboard([
      ["🛍 Открыть магазин"],
      ...(isAdmin ? [["⚙️ Админ панель"]] : []),
    ]).resize()
  );
});

bot.hears("🛍 Открыть магазин", async (ctx) => {
  const url = process.env.WEBAPP_URL;
  await ctx.reply("Открываю магазин...", Markup.inlineKeyboard([
    Markup.button.webApp("Перейти в магазин", url)
  ]));
});

bot.hears("⚙️ Админ панель", async (ctx) => {
  if (!adminIds.includes(ctx.from.id.toString())) return;
  await ctx.reply("Панель администратора:", Markup.keyboard([
    ["📤 Загрузить товары (CSV)"],
    ["📝 Изменить товары", "➕ Добавить админа"]
  ]).resize());
});

bot.hears("📤 Загрузить товары (CSV)", async (ctx) => {
  await ctx.reply("Введите названия столбцов через пробел (например: название цена описание фото):");
  bot.once("text", async (ctx2) => {
    const columns = ctx2.message.text.split(" ");
    await ctx2.reply("Теперь отправьте CSV-файл.");
    bot.once("document", async (ctx3) => {
      const fileLink = await ctx3.telegram.getFileLink(ctx3.message.document.file_id);
      const result = await csvParser.parseFromUrl(fileLink.href, columns);
      for (const item of result) {
        await supabase.from("products").insert(item);
      }
      await ctx3.reply("Товары успешно загружены!");
    });
  });
});

bot.launch();