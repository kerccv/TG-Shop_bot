import express from "express";
import path from "path";
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import csvParser from 'csv-parser';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.resolve();

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL;

let products = [];
let admins = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];

app.use(express.json());
app.use("/webapp", express.static(path.join(__dirname, "webapp")));

bot.start((ctx) => {
  const userId = ctx.from.id.toString();
  const isAdmin = admins.includes(userId);
  
  const buttons = [
    [{ text: "Открыть магазин", web_app: { url: WEBAPP_URL } }]
  ];
  
  if (isAdmin) {
    buttons.push([{ text: "Админ-панель", callback_data: "admin_panel" }]);
  }

  ctx.reply(
    "Добро пожаловать в магазин постельного белья! Выберите действие:",
    {
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  );
});

bot.action("admin_panel", (ctx) => {
  const userId = ctx.from.id.toString();
  if (!admins.includes(userId)) {
    return ctx.reply("Доступ запрещен");
  }

  ctx.reply("Админ-панель:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Парсер товаров", callback_data: "parse_products" }],
        [{ text: "Редактировать товары", callback_data: "edit_products" }],
        [{ text: "Добавить админа", callback_data: "add_admin" }],
        [{ text: "Просмотреть товары", callback_data: "view_products" }],
        [{ text: "Массовая наценка", callback_data: "bulk_price" }]
      ]
    }
  });
});

bot.action("parse_products", (ctx) => {
  ctx.reply("Отправьте CSV-файл с товарами (формат: name,price,description,image_url,category,stock)");
});

bot.on("document", async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!admins.includes(userId)) return;

  try {
    const file = await ctx.telegram.getFile(ctx.message.document.file_id);
    const filePath = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    
    const newProducts = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        newProducts.push({
          id: uuidv4(),
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          image_url: row.image_url,
          category: row.category || "Без категории",
          stock: parseInt(row.stock) || 0,
          tags: row.tags ? row.tags.split(';') : []
        });
      })
      .on('end', () => {
        products = [...products, ...newProducts];
        ctx.reply(`Добавлено ${newProducts.length} товаров!`);
      });
  } catch (err) {
    ctx.reply("Ошибка обработки файла: " + err.message);
  }
});

bot.action("edit_products", (ctx) => {
  ctx.reply("Введите: id,название,цена,описание,категория,остаток (оставьте пустым для сохранения текущего значения)");
});

bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!admins.includes(userId)) return;

  const text = ctx.message.text;
  if (text.startsWith("edit")) {
    try {
      const [, id, name, price, description, category, stock] = text.split(",");
      const productIndex = products.findIndex(p => p.id === id);
      
      if (productIndex === -1) {
        return ctx.reply("Товар не найден");
      }

      products[productIndex] = {
        ...products[productIndex],
        name: name || products[productIndex].name,
        price: price && !isNaN(parseFloat(price)) ? parseFloat(price) : products[productIndex].price,
        description: description || products[productIndex].description,
        category: category || products[productIndex].category,
        stock: stock && !isNaN(parseInt(stock)) ? parseInt(stock) : products[productIndex].stock
      };

      ctx.reply("Товар обновлен!");
    } catch (err) {
      ctx.reply("Ошибка: " + err.message);
    }
  } else if (text.startsWith("bulk")) {
    try {
      const [, type, value] = text.split(",");
      const parsedValue = parseFloat(value);

      products = products.map(product => ({
        ...product,
        price: type === "percent"
          ? product.price * (1 + parsedValue / 100)
          : product.price + parsedValue
      }));

      ctx.reply("Цены обновлены!");
    } catch (err) {
      ctx.reply("Ошибка: " + err.message);
    }
  } else if (text.match(/^\d+$/)) {
    admins.push(text);
    ctx.reply(`Админ с ID ${text} добавлен!`);
  }
});

bot.action("bulk_price", (ctx) => {
  ctx.reply("Введите тип наценки (percent или fixed) и значение (например, percent,10 или fixed,500)");
});

bot.action("view_products", (ctx) => {
  if (products.length === 0) {
    return ctx.reply("Товаров пока нет");
  }

  const productList = products.map(p => 
    `ID: ${p.id}\nНазвание: ${p.name}\nЦена: ${p.price} ₽\nКатегория: ${p.category}\nОстаток: ${p.stock}\nТеги: ${p.tags.join(", ")}`
  ).join("\n\n");
  
  ctx.reply(productList);
});

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.get("/api/products", (req, res) => {
  res.json(products);
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