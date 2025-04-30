import express from "express";
import path from "path";
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import csvParser from 'csv-parser';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.resolve();

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL;

// Инициализация Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Словарь синонимов для распознавания столбцов
const columnSynonyms = {
  name: ['name', 'title', 'product_name', 'item', 'название', 'имя', 'продукт', 'товар'],
  price: ['price', 'cost', 'value', 'цена', 'стоимость'],
  description: ['description', 'desc', 'info', 'details', 'описание', 'информация', 'детали'],
  image_url: ['image', 'img', 'photo', 'picture', 'url', 'image_url', 'изображение', 'фото', 'ссылка'],
  category: ['category', 'type', 'group', 'категория', 'тип', 'группа'],
  stock: ['stock', 'quantity', 'qty', 'available', 'остаток', 'количество', 'в_наличии'],
  tags: ['tags', 'labels', 'keywords', 'теги', 'метки', 'ключевые_слова']
};

// Функция для сопоставления заголовков столбцов
function mapColumn(header) {
  const cleanHeader = header.toLowerCase().replace(/[_-\s]/g, '');
  for (const [field, synonyms] of Object.entries(columnSynonyms)) {
    if (synonyms.some(synonym => cleanHeader.includes(synonym.toLowerCase()))) {
      return field;
    }
  }
  return null;
}

// Middleware
app.use(express.json());
app.use("/webapp", express.static(path.join(__dirname, "webapp")));

// Команда /start
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const { data: admins } = await supabase.from('admins').select('user_id');
  const isAdmin = admins ? admins.some(admin => admin.user_id === userId) : false;
  
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

// Админ-панель
bot.action("admin_panel", async (ctx) => {
  const userId = ctx.from.id.toString();
  const { data: admins } = await supabase.from('admins').select('user_id');
  if (!admins || !admins.some(admin => admin.user_id === userId)) {
    return ctx.reply("Доступ запрещен");
  }

  ctx.reply("Админ-панель:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Парсер товаров", callback_data: "parse_products" }],
        [{ text: "Редактировать товары", callback_data: "edit_products" }],
        [{ text: "Управление видимостью", callback_data: "toggle_visibility" }],
        [{ text: "Добавить админа", callback_data: "add_admin" }],
        [{ text: "Просмотреть товары", callback_data: "view_products" }],
        [{ text: "Массовая наценка", callback_data: "bulk_price" }]
      ]
    }
  });
});

// Парсер товаров из CSV
bot.action("parse_products", (ctx) => {
  ctx.reply("Отправьте CSV-файл с товарами. Бот автоматически распознает столбцы (например, name, price, description и т.д.).");
});

bot.on("document", async (ctx) => {
  const userId = ctx.from.id.toString();
  const { data: admins } = await supabase.from('admins').select('user_id');
  if (!admins || !admins.some(admin => admin.user_id === userId)) return;

  try {
    const file = await ctx.telegram.getFile(ctx.message.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    
    const response = await fetch(fileUrl);
    const buffer = await response.buffer();
    
    const newProducts = [];
    let columnMapping = {};

    buffer
      .pipe(csvParser())
      .on('headers', (headers) => {
        // Сопоставляем заголовки с полями
        columnMapping = headers.reduce((acc, header) => {
          const field = mapColumn(header);
          if (field) acc[field] = header;
          return acc;
        }, {});
      })
      .on('data', (row) => {
        const product = {
          id: uuidv4(),
          name: columnMapping.name ? row[columnMapping.name] || "Без названия" : "Без названия",
          price: columnMapping.price && !isNaN(parseFloat(row[columnMapping.price])) 
            ? parseFloat(row[columnMapping.price]) 
            : 0,
          description: columnMapping.description ? row[columnMapping.description] || '' : '',
          image_url: columnMapping.image_url ? row[columnMapping.image_url] || '' : '',
          category: columnMapping.category ? row[columnMapping.category] || "Без категории" : "Без категории",
          stock: columnMapping.stock && !isNaN(parseInt(row[columnMapping.stock])) 
            ? parseInt(row[columnMapping.stock]) 
            : 0,
          tags: columnMapping.tags && row[columnMapping.tags] 
            ? row[columnMapping.tags].split(/[;,\s]+/).filter(tag => tag) 
            : [],
          is_visible: false
        };
        newProducts.push(product);
      })
      .on('end', async () => {
        if (newProducts.length === 0) {
          ctx.reply("CSV-файл пуст или не содержит распознаваемых данных.");
          return;
        }

        const { error } = await supabase.from('products').insert(newProducts);
        if (error) {
          ctx.reply("Ошибка сохранения товаров: " + error.message);
        } else {
          ctx.reply(`Добавлено ${newProducts.length} товаров! Используйте "Управление видимостью", чтобы включить их отображение.`);
        }
      });
  } catch (err) {
    ctx.reply("Ошибка обработки файла: " + err.message);
  }
});

// Редактирование товаров
bot.action("edit_products", (ctx) => {
  ctx.reply("Введите: id,название,цена,описание,категория,остаток,теги (оставьте пустым для сохранения текущего значения)");
});

bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const { data: admins } = await supabase.from('admins').select('user_id');
  if (!admins || !admins.some(admin => admin.user_id === userId)) return;

  const text = ctx.message.text;
  if (text.startsWith("edit")) {
    try {
      const [, id, name, price, description, category, stock, tags] = text.split(",");
      const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
      
      if (!product) {
        return ctx.reply("Товар не найден");
      }

      const updatedProduct = {
        name: name || product.name,
        price: price && !isNaN(parseFloat(price)) ? parseFloat(price) : product.price,
        description: description || product.description,
        category: category || product.category,
        stock: stock && !isNaN(parseInt(stock)) ? parseInt(stock) : product.stock,
        tags: tags ? tags.split(/[;,\s]+/).filter(tag => tag) : product.tags
      };

      const { error } = await supabase.from('products').update(updatedProduct).eq('id', id);
      if (error) {
        ctx.reply("Ошибка обновления товара: " + error.message);
      } else {
        ctx.reply("Товар обновлен!");
      }
    } catch (err) {
      ctx.reply("Ошибка: " + err.message);
    }
  } else if (text.startsWith("bulk")) {
    try {
      const [, type, value] = text.split(",");
      const parsedValue = parseFloat(value);

      const { data: products } = await supabase.from('products').select('*');
      const updatedProducts = products.map(product => ({
        ...product,
        price: type === "percent"
          ? product.price * (1 + parsedValue / 100)
          : product.price + parsedValue
      }));

      const { error } = await supabase.from('products').upsert(updatedProducts);
      if (error) {
        ctx.reply("Ошибка обновления цен: " + error.message);
      } else {
        ctx.reply("Цены обновлены!");
      }
    } catch (err) {
      ctx.reply("Ошибка: " + err.message);
    }
  } else if (text.startsWith("visibility")) {
    try {
      const [, id, state] = text.split(",");
      const isVisible = state.toLowerCase() === "true";
      
      const { error } = await supabase.from('products').update({ is_visible: isVisible }).eq('id', id);
      if (error) {
        ctx.reply("Ошибка изменения видимости: " + error.message);
      } else {
        ctx.reply(`Видимость товара ${id} установлена в ${isVisible ? "вкл" : "выкл"}`);
      }
    } catch (err) {
      ctx.reply("Ошибка: " + err.message);
    }
  } else if (text.match(/^\d+$/)) {
    const { error } = await supabase.from('admins').insert({ user_id: text });
    if (error) {
      ctx.reply("Ошибка добавления админа: " + error.message);
    } else {
      ctx.reply(`Админ с ID ${text} добавлен!`);
    }
  }
});

// Управление видимостью
bot.action("toggle_visibility", (ctx) => {
  ctx.reply("Введите: visibility,id,true/false (например, visibility,12345,true для включения видимости)");
});

// Массовая наценка
bot.action("bulk_price", (ctx) => {
  ctx.reply("Введите тип наценки (percent или fixed) и значение (например, percent,10 или fixed,500)");
});

// Просмотр товаров
bot.action("view_products", async (ctx) => {
  const { data: products } = await supabase.from('products').select('*');
  if (!products || products.length === 0) {
    return ctx.reply("Товаров пока нет");
  }

  const productList = products.map(p => 
    `ID: ${p.id}\nНазвание: ${p.name}\nЦена: ${p.price} ₽\nКатегория: ${p.category}\nОстаток: ${p.stock}\nТеги: ${p.tags.join(", ")}\nВидимость: ${p.is_visible ? "вкл" : "выкл"}`
  ).join("\n\n");
  
  ctx.reply(productList);
});

// Webhook
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// API для мини-приложения
app.get("/api/products", async (req, res) => {
  const { data: products } = await supabase.from('products').select('*').eq('is_visible', true);
  res.json(products || []);
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

// Тестовый импорт зависимостей
console.log('csv-parser успешно импортирован');
console.log('uuid успешно импортирован');