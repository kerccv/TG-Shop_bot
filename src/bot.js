import { Telegraf } from "telegraf";
import { parseCSV } from "./csvParser.js";
import { isAdminUser, updateProduct, bulkUpdatePrices, toggleProductVisibility, addAdmin, getAllProducts, resetProductsCache } from "./supabase.js";
import { logger } from "./utils.js";

// Инициализация бота
export const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL || "https://lavandershopsite.onrender.com/webapp/index.html";

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
    const newProducts = await parseCSV(fileUrl);
    
    if (newProducts.length === 0) {
      await ctx.reply("⚠️ CSV-файл пуст или не содержит данных.");
      logger.warn("CSV file empty", { userId });
      return;
    }

    const { error } = await supabase.from("products").insert(newProducts);
    if (error) {
      logger.error("Supabase error inserting products", { error, userId });
      await ctx.reply("❌ Ошибка сохранения товаров: " + error.message);
    } else {
      await resetProductsCache(); // Сбрасываем кэш
      await ctx.reply(
        `✅ Добавлено ${newProducts.length} товаров! Используйте "Управление видимостью" для отображения.`
      );
      logger.info("Products inserted", { userId, count: newProducts.length });
    }
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
  const userId = ctx.from.id.toString();
  try {
    const products = await getAllProducts();
    if (!products || products.length === 0) {
      await ctx.reply("⚠️ Товаров пока нет");
      logger.info("No products found", { userId });
      return;
    }

    const productList = products
      .map(
        (p) =>
          `📌 ID: ${p.id}\nНазвание: ${p.name}\nЦена: ${p.price} ₽\nКатегория: ${p.category}\nОстаток: ${p.stock}\nТеги: ${
            p.tags?.join(", ") || "Нет тегов"
          }\nВидимость: ${p.is_visible ? "✅ Вкл" : "❌ Выкл"}`
      )
      .join("\n\n");

    await ctx.reply(productList);
    logger.info("Sent products list", { userId, count: products.length });
  } catch (err) {
    logger.error("Error in view_products", { error: err.message, userId });
    await ctx.reply("❌ Ошибка получения товаров: " + err.message);
  }
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

  try {
    if (text.startsWith("edit")) {
      const [, id, name, price, description, category, stock, tags] = text.split(",");
      const updatedProduct = {
        name,
        price: price && !isNaN(parseFloat(price)) ? parseFloat(price) : undefined,
        description,
        category,
        stock: stock && !isNaN(parseInt(stock)) ? parseInt(stock) : undefined,
        tags: tags ? tags.split(/[;,\s]+/).filter((tag) => tag) : undefined,
      };
      await updateProduct(id, updatedProduct);
      await ctx.reply("✅ Товар обновлён!");
      logger.info("Product updated", { userId, id });
    } else if (text.startsWith("bulk")) {
      const [, type, value] = text.split(",");
      const parsedValue = parseFloat(value);
      await bulkUpdatePrices(type, parsedValue);
      await ctx.reply("✅ Цены обновлены!");
      logger.info("Prices updated in bulk", { userId, type, value });
    } else if (text.startsWith("visibility")) {
      const [, id, state] = text.split(",");
      const isVisible = state.toLowerCase() === "true";
      await toggleProductVisibility(id, isVisible);
      await ctx.reply(`✅ Видимость товара ${id} установлена в ${isVisible ? "вкл" : "выкл"}`);
      logger.info("Visibility updated", { userId, id, isVisible });
    } else if (text.match(/^\d+$/)) {
      await addAdmin(text);
      await ctx.reply(`✅ Админ с ID ${text} добавлен!`);
      logger.info("Admin added", { userId, newAdminId: text });
    }
  } catch (err) {
    logger.error("Error in text handler", { error: err.message, userId, text });
    await ctx.reply("❌ Ошибка: " + err.message);
  }
});