import express from "express";
import path from "path";
import cors from "cors";
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
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://lavandershopsite.onrender.com/webapp/index.html';

// Инициализация Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use("/webapp", express.static(path.join(__dirname, "webapp")));
app.use("/public", express.static(path.join(__dirname, "public")));

// Словарь синонимов для парсера CSV
const columnSynonyms = {
  name: ['name', 'title', 'product_name', 'item', 'название', 'имя', 'продукт', 'товар'],
  price: ['price', 'cost', 'value', 'цена', 'стоимость'],
  description: ['description', 'desc', 'info', 'details', 'описание', 'информация', 'детали'],
  image_url: ['image', 'img', 'photo', 'picture', 'url', 'image_url', 'изображение', 'фото', 'ссылка'],
  category: ['category', 'type', 'group', 'категория', 'тип', 'группа'],
  stock: ['stock', 'quantity', 'qty', 'available', 'остаток', 'количество', 'в_наличии'],
  tags: ['tags', 'labels', 'keywords', 'теги', 'метки', 'ключевые_слова']
};

// Функция для сопоставления заголовков CSV
function mapColumn(header) {
  const cleanHeader = header.toLowerCase().replace(/[_-\s]/g, '');
  for (const [field, synonyms] of Object.entries(columnSynonyms)) {
    if (synonyms.some(synonym => cleanHeader.includes(synonym.toLowerCase()))) {
      return field;
    }
  }
  return null;
}

// Проверка таблицы и RLS
async function checkTable(tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    if (error) {
      console.error(`Error checking table ${tableName}:`, error);
      if (error.message.includes('RLS')) {
        console.warn(`RLS policy violation for table ${tableName}. Check RLS settings and policies.`);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Unexpected error checking table ${tableName}:`, err);
    return false;
  }
}

// Команда /start
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  let isAdmin = false;

  try {
    // Заглушка для админов из ADMIN_IDS
    const adminIdsFromEnv = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    if (adminIdsFromEnv.includes(userId)) {
      isAdmin = true;
      console.log('Admin access granted via ADMIN_IDS:', userId);
    }

    // Проверка таблицы admins
    const tableExists = await checkTable('admins');
    if (!tableExists) {
      console.warn('Admins table is inaccessible or RLS is not configured');
    } else {
      const { data: admins, error } = await supabase.from('admins').select('user_id');
      if (error) {
        console.error('Supabase error in /start:', error);
        ctx.reply('❌ Ошибка проверки админа, но доступ предоставлен по ID');
      } else {
        console.log('User ID:', userId);
        console.log('Admins from Supabase:', admins);
        isAdmin = isAdmin || (admins && admins.some(admin => admin.user_id === userId));
        console.log('Is Admin:', isAdmin);
      }
    }
  } catch (err) {
    console.error('Unexpected error in /start:', err);
    ctx.reply('❌ Ошибка сервера, но доступ предоставлен по ID');
  }

  const buttons = [
    [{ text: "🛒 Открыть магазин", web_app: { url: WEBAPP_URL } }]
  ];

  if (isAdmin) {
    buttons.push([{ text: "🔑 Админ-панель", callback_data: "admin_panel" }]);
  }

  ctx.reply(
    "✨ Добро пожаловать в магазин постельного белья! Выберите действие:",
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
  try {
    const adminIdsFromEnv = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    let isAdmin = adminIdsFromEnv.includes(userId);

    const tableExists = await checkTable('admins');
    if (tableExists) {
      const { data: admins, error } = await supabase.from('admins').select('user_id');
      if (error) {
        console.error('Supabase error in admin_panel:', error);
      } else if (admins) {
        isAdmin = isAdmin || admins.some(admin => admin.user_id === userId);
      }
    }

    if (!isAdmin) {
      return ctx.reply("🚫 Доступ запрещён");
    }

    ctx.reply("🔑 Админ-панель:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📦 Парсер товаров", callback_data: "parse_products" },
            { text: "✏️ Редактировать товары", callback_data: "edit_products" }
          ],
          [
            { text: "👁️ Управление видимостью", callback_data: "toggle_visibility" },
            { text: "👤 Добавить админа", callback_data: "add_admin" }
          ],
          [
            { text: "📋 Просмотреть товары", callback_data: "view_products" },
            { text: "💰 Массовая наценка", callback_data: "bulk_price" }
          ]
        ]
      }
    });
  } catch (err) {
    console.error('Unexpected error in admin_panel:', err);
    ctx.reply('❌ Ошибка сервера');
  }
});

// Парсер CSV
bot.action("parse_products", (ctx) => {
  ctx.reply("📤 Отправьте CSV-файл с товарами. Бот распознает столбцы (например, name, price, description).");
});

bot.on("document", async (ctx) => {
  const userId = ctx.from.id.toString();
  try {
    const adminIdsFromEnv = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    let isAdmin = adminIdsFromEnv.includes(userId);

    const tableExists = await checkTable('admins');
    if (tableExists) {
      const { data: admins, error } = await supabase.from('admins').select('user_id');
      if (error) {
        console.error('Supabase error in document handler:', error);
      } else if (admins) {
        isAdmin = isAdmin || admins.some(admin => admin.user_id === userId);
      }
    }

    if (!isAdmin) {
      return;
    }

    const file = await ctx.telegram.getFile(ctx.message.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    
    const response = await fetch(fileUrl);
    const buffer = await response.buffer();
    
    const newProducts = [];
    let columnMapping = {};

    buffer
      .pipe(csvParser())
      .on('headers', (headers) => {
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
          ctx.reply("⚠️ CSV-файл пуст или не содержит данных.");
          return;
        }

        const { error } = await supabase.from('products').insert(newProducts);
        if (error) {
          console.error('Supabase error inserting products:', error);
          ctx.reply("❌ Ошибка сохранения товаров: " + error.message);
        } else {
          ctx.reply(`✅ Добавлено ${newProducts.length} товаров! Используйте "Управление видимостью" для отображения.`);
        }
      });
  } catch (err) {
    console.error('Error processing CSV:', err);
    ctx.reply("❌ Ошибка обработки файла: " + err.message);
  }
});

// Редактирование товаров
bot.action("edit_products", (ctx) => {
  ctx.reply("✏️ Введите: edit,id,название,цена,описание,категория,остаток,теги (оставьте пустым для текущего значения)");
});

// Обработка текстовых команд
bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;

  try {
    const adminIdsFromEnv = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    let isAdmin = adminIdsFromEnv.includes(userId);

    const tableExists = await checkTable('admins');
    if (tableExists) {
      const { data: admins, error } = await supabase.from('admins').select('user_id');
      if (error) {
        console.error('Supabase error in text handler:', error);
      } else if (admins) {
        isAdmin = isAdmin || admins.some(admin => admin.user_id === userId);
      }
    }

    if (!isAdmin) {
      return;
    }

    if (text.startsWith("edit")) {
      const [, id, name, price, description, category, stock, tags] = text.split(",");
      const { data: product, error: fetchError } = await supabase.from('products').select('*').eq('id', id).single();
      
      if (fetchError || !product) {
        console.error('Error fetching product:', fetchError);
        return ctx.reply("⚠️ Товар не найден");
      }

      const updatedProduct = {
        name: name || product.name,
        price: price && !isNaN(parseFloat(price)) ? parseFloat(price) : product.price,
        description: description || product.description,
        category: category || product.category,
        stock: stock && !isNaN(parseInt(stock)) ? parseInt(stock) : product.stock,
        tags: tags ? tags.split(/[;,\s]+/).filter(tag => tag) : product.tags
      };

      const { error: updateError } = await supabase.from('products').update(updatedProduct).eq('id', id);
      if (updateError) {
        console.error('Error updating product:', updateError);
        ctx.reply("❌ Ошибка обновления товара: " + updateError.message);
      } else {
        ctx.reply("✅ Товар обновлён!");
      }
    } else if (text.startsWith("bulk")) {
      const [, type, value] = text.split(",");
      const parsedValue = parseFloat(value);

      const { data: products, error: fetchError } = await supabase.from('products').select('*');
      if (fetchError) {
        console.error('Error fetching products:', fetchError);
        ctx.reply("❌ Ошибка получения товаров: " + fetchError.message);
        return;
      }

      const updatedProducts = products.map(product => ({
        ...product,
        price: type === "percent"
          ? product.price * (1 + parsedValue / 100)
          : product.price + parsedValue
      }));

      const { error: updateError } = await supabase.from('products').upsert(updatedProducts);
      if (updateError) {
        console.error('Error updating prices:', updateError);
        ctx.reply("❌ Ошибка обновления цен: " + updateError.message);
      } else {
        ctx.reply("✅ Цены обновлены!");
      }
    } else if (text.startsWith("visibility")) {
      const [, id, state] = text.split(",");
      const isVisible = state.toLowerCase() === "true";
      
      const { error } = await supabase.from('products').update({ is_visible: isVisible }).eq('id', id);
      if (error) {
        console.error('Error updating visibility:', error);
        ctx.reply("❌ Ошибка изменения видимости: " + error.message);
      } else {
        ctx.reply(`✅ Видимость товара ${id} установлена в ${isVisible ? "вкл" : "выкл"}`);
      }
    } else if (text.match(/^\d+$/)) {
      const { error } = await supabase.from('admins').insert({ user_id: text });
      if (error) {
        console.error('Error adding admin:', error);
        ctx.reply("❌ Ошибка добавления админа: " + error.message);
      } else {
        ctx.reply(`✅ Админ с ID ${text} добавлен!`);
      }
    }
  } catch (err) {
    console.error('Unexpected error in text handler:', err);
    ctx.reply('❌ Ошибка сервера');
  }
});

// Управление видимостью
bot.action("toggle_visibility", (ctx) => {
  ctx.reply("👁️ Введите: visibility,id,true/false (например, visibility,12345,true)");
});

// Массовая наценка
bot.action("bulk_price", (ctx) => {
  ctx.reply("💰 Введите: bulk,percent/fixed,значение (например, bulk,percent,10)");
});

// Просмотр товаров
bot.action("view_products", async (ctx) => {
  try {
    const { data: products, error } = await supabase.from('products').select('*');
    if (error) {
      console.error('Error fetching products:', error);
      ctx.reply("❌ Ошибка получения товаров: " + error.message);
      return;
    }

    if (!products || products.length === 0) {
      ctx.reply("⚠️ Товаров пока нет");
      return;
    }

    const productList = products.map(p => 
      `📌 ID: ${p.id}\nНазвание: ${p.name}\nЦена: ${p.price} ₽\nКатегория: ${p.category}\nОстаток: ${p.stock}\nТеги: ${p.tags.join(", ") || "Нет тегов"}\nВидимость: ${p.is_visible ? "✅ Вкл" : "❌ Выкл"}`
    ).join("\n\n");
    
    ctx.reply(productList);
  } catch (err) {
    console.error('Unexpected error in view_products:', err);
    ctx.reply('❌ Ошибка сервера');
  }
});

// Webhook
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// API для веб-приложения
app.get("/api/products", async (req, res) => {
  try {
    const { data, error } = await supabase.from("products").select("*").eq('is_visible', true);
    if (error) {
      console.error('Supabase error in /api/products:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
  } catch (err) {
    console.error('Unexpected error in /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});

// Тестовое подключение к Supabase
app.get("/test-supabase", async (req, res) => {
  try {
    const { data, error } = await supabase.from('admins').select('user_id');
    res.json({ data, error });
  } catch (err) {
    res.json({ error: err.message });
  }
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