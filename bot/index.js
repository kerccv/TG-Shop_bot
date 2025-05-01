import express from "express";
import path from "path";
import cors from "cors";
import { Telegraf } from "telegraf";
import * as dotenv from "dotenv";
import csvParser from "csv-parser";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import winston from "winston";
import retry from "async-retry";

// Загрузка переменных окружения
dotenv.config();

// Инициализация логгера
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.resolve();

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL =
  process.env.WEBAPP_URL || "https://lavandershopsite.onrender.com/webapp/index.html";

// Инициализация Supabase с тайм-аутом
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  fetch: (url, options) =>
    fetch(url, { ...options, timeout: 5000 }).catch((err) => {
      logger.error("Supabase fetch failed", { error: err.message });
      throw err;
    }),
});

// Middleware
app.use(cors());
app.use(express.json());
app.use("/webapp", express.static(path.join(__dirname, "webapp")));
app.use("/public", express.static(path.join(__dirname, "public")));

// Словарь синонимов для парсера CSV
const columnSynonyms = {
  name: ["name", "title", "product_name", "item", "название", "имя", "продукт", "товар"],
  price: ["price", "cost", "value", "цена", "стоимость"],
  description: ["description", "desc", "info", "details", "описание", "информация", "детали"],
  image_url: ["image", "img", "photo", "picture", "url", "image_url", "изображение", "фото", "ссылка"],
  category: ["category", "type", "group", "категория", "тип", "группа"],
  stock: ["stock", "quantity", "qty", "available", "остаток", "количество", "в_наличии"],
  tags: ["tags", "labels", "keywords", "теги", "метки", "ключевые_слова"],
};

// Функция для сопоставления заголовков CSV
const mapColumn = (header) => {
  const cleanHeader = header.toLowerCase().replace(/[_-\s]/g, "");
  for (const [field, synonyms] of Object.entries(columnSynonyms)) {
    if (synonyms.some((synonym) => cleanHeader.includes(synonym.toLowerCase()))) {
      return field;
    }
  }
  return null;
};

// Проверка таблицы с повторными попытками
const checkTable = async (tableName) => {
  return await retry(
    async () => {
      const { data, error } = await supabase.from(tableName).select("*").limit(1);
      if (error) {
        logger.error(`Error checking table ${tableName}`, { error });
        throw new Error(error.message);
      }
      return !!data;
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
      onRetry: (err, attempt) =>
        logger.warn(`Retrying checkTable ${tableName}, attempt ${attempt}`, { error: err.message }),
    }
  ).catch((err) => {
    logger.error(`Failed to check table ${tableName} after retries`, { error: err.message });
    return false;
  });
};

// Проверка админ-прав
const isAdminUser = async (userId) => {
  const adminIdsFromEnv = process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(",").map((id) => id.trim())
    : [];
  if (adminIdsFromEnv.includes(userId)) {
    logger.info("Admin access granted via ADMIN_IDS", { userId });
    return true;
  }

  // Временное отключение Supabase до решения проблемы
  logger.warn("Supabase check skipped due to connectivity issues");
  return false;
};

// Команда /start
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received /start command", { userId });

  let isAdmin = false;
  try {
    isAdmin = await isAdminUser(userId);
  } catch (err) {
    logger.error("Error checking admin status", { error: err.message, userId });
    ctx.reply("❌ Ошибка сервера, но доступ предоставлен по ID");
  }

  const buttons = [[{ text: "🛒 Открыть магазин", web_app: { url: WEBAPP_URL } }]];
  if (isAdmin) {
    buttons.push([{ text: "🔑 Админ-панель", callback_data: "admin_panel" }]);
  }

  await ctx.reply("✨ Добро пожаловать в магазин постельного белья! Выберите действие:", {
    reply_markup: { inline_keyboard: buttons },
  });
  logger.info("Sent /start response", { userId, isAdmin });
});

// Админ-панель
bot.action("admin_panel", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received admin_panel action", { userId });

  let isAdmin = false;
  try {
    isAdmin = await isAdminUser(userId);
  } catch (err) {
    logger.error("Error checking admin status in admin_panel", { error: err.message, userId });
    return ctx.reply("❌ Ошибка сервера");
  }

  if (!isAdmin) {
    logger.warn("Admin access denied", { userId });
    return ctx.reply("🚫 Доступ запрещён");
  }

  await ctx.reply("🔑 Админ-панель:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📦 Парсер товаров", callback_data: "parse_products" },
          { text: "✏️ Редактировать товары", callback_data: "edit_products" },
        ],
        [
          { text: "👁️ Управление видимостью", callback_data: "toggle_visibility" },
          { text: "👤 Добавить админа", callback_data: "add_admin" },
        ],
        [
          { text: "📋 Просмотреть товары", callback_data: "view_products" },
          { text: "💰 Массовая наценка", callback_data: "bulk_price" },
        ],
      ],
    },
  });
  logger.info("Sent admin panel", { userId });
});

// Парсер CSV
bot.action("parse_products", async (ctx) => {
  await ctx.reply("📤 Отправьте CSV-файл с товарами. Бот распознает столбцы (например, name, price, description).");
  logger.info("Prompted for CSV upload", { userId: ctx.from.id });
});

bot.on("document", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received document", { userId });

  let isAdmin = false;
  try {
    isAdmin = await isAdminUser(userId);
  } catch (err) {
    logger.error("Error checking admin status in document handler", { error: err.message, userId });
    return ctx.reply("❌ Ошибка сервера");
  }

  if (!isAdmin) {
    logger.warn("Admin access denied for document upload", { userId });
    return;
  }

  try {
    const file = await ctx.telegram.getFile(ctx.message.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl, { timeout: 5000 });
    const buffer = await response.buffer();

    const newProducts = [];
    let columnMapping = {};

    buffer
      .pipe(csvParser())
      .on("headers", (headers) => {
        columnMapping = headers.reduce((acc, header) => {
          const field = mapColumn(header);
          if (field) acc[field] = header;
          return acc;
        }, {});
      })
      .on("data", (row) => {
        const product = {
          id: uuidv4(),
          name: columnMapping.name ? row[columnMapping.name] || "Без названия" : "Без названия",
          price: columnMapping.price && !isNaN(parseFloat(row[columnMapping.price]))
            ? parseFloat(row[columnMapping.price])
            : 0,
          description: columnMapping.description ? row[columnMapping.description] || "" : "",
          image_url: columnMapping.image_url ? row[columnMapping.image_url] || "" : "",
          category: columnMapping.category ? row[columnMapping.category] || "Без категории" : "Без категории",
          stock: columnMapping.stock && !isNaN(parseInt(row[columnMapping.stock]))
            ? parseInt(row[columnMapping.stock])
            : 0,
          tags: columnMapping.tags && row[columnMapping.tags]
            ? row[columnMapping.tags].split(/[;,\s]+/).filter((tag) => tag)
            : [],
          is_visible: false,
        };
        newProducts.push(product);
      })
      .on("end", async () => {
        if (newProducts.length === 0) {
          await ctx.reply("⚠️ CSV-файл пуст или не содержит данных.");
          logger.warn("CSV file empty", { userId });
          return;
        }

        // Временное отключение Supabase
        await ctx.reply(
          `✅ Файл обработан, но сохранение товаров временно отключено из-за проблем с базой данных.`
        );
        logger.info("CSV processed, Supabase insert skipped", { userId, productCount: newProducts.length });
      });
  } catch (err) {
    logger.error("Error processing CSV", { error: err.message, userId });
    await ctx.reply("❌ Ошибка обработки файла: " + err.message);
  }
});

// Обработчики текстовых команд
bot.action("edit_products", async (ctx) => {
  await ctx.reply(
    "✏️ Введите: edit,id,название,цена,описание,категория,остаток,теги (оставьте пустым для текущего значения)"
  );
});

bot.action("toggle_visibility", async (ctx) => {
  await ctx.reply("👁️ Введите: visibility,id,true/false (например, visibility,12345,true)");
});

bot.action("bulk_price", async (ctx) => {
  await ctx.reply("💰 Введите: bulk,percent/fixed,значение (например, bulk,percent,10)");
});

bot.action("view_products", async (ctx) => {
  await ctx.reply("⚠️ Просмотр товаров временно отключён из-за проблем с базой данных.");
  logger.info("View products skipped due to Supabase issues", { userId: ctx.from.id });
});

bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;
  logger.info("Received text message", { userId, text });

  let isAdmin = false;
  try {
    isAdmin = await isAdminUser(userId);
  } catch (err) {
    logger.error("Error checking admin status in text handler", { error: err.message, userId });
    return ctx.reply("❌ Ошибка сервера");
  }

  if (!isAdmin) {
    logger.warn("Admin access denied for text command", { userId });
    return;
  }

  await ctx.reply("⚠️ Операции с товарами временно отключены из-за проблем с базой данных.");
  logger.info("Text command skipped due to Supabase issues", { userId, command: text });
});

// Webhook
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
  logger.info("Webhook request processed");
});

// API для веб-приложения
app.get("/api/products", async (req, res) => {
  logger.info("Received /api/products request");
  res.status(503).json({ error: "Service temporarily unavailable due to database issues" });
});

// Тестовое подключение к Supabase
app.get("/test-supabase", async (req, res) => {
  logger.info("Received /test-supabase request");
  res.status(503).json({ error: "Supabase temporarily disabled" });
});

// Keep-alive для Render
const keepAlive = () => {
  setInterval(async () => {
    try {
      await fetch(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}/api/products`);
      logger.info("Keep-alive ping sent");
    } catch (err) {
      logger.error("Keep-alive ping failed", { error: err.message });
    }
  }, 5 * 60 * 1000); // Каждые 5 минут
};

// Запуск сервера
app.listen(PORT, async () => {
  logger.info(`Server started on port ${PORT}`);
  try {
    const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/bot${process.env.BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    logger.info("Webhook set", { webhookUrl });
    keepAlive();
  } catch (err) {
    logger.error("Error setting webhook", { error: err.message });
  }
});