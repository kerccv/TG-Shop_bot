import { Telegraf } from "telegraf";
import { parseCSV } from "./csvParser.js";
import { updateProduct, bulkUpdatePrices, toggleProductVisibility, addAdmin, getAllProducts, resetProductsCache, isAdminUser } from "./supabase.js";
import { logger } from "./utils.js";

// Инициализация бота
export const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL || "https://tg-shop-bot-gw2h.onrender.com/webapp/index.html";

// Установка постоянной кнопки "Open App" при запуске бота
bot.telegram.setChatMenuButton({
  type: "web_app",
  text: "Open App",
  web_app: { url: WEBAPP_URL },
}).then(() => {
  logger.info("Custom menu button 'Open App' set at startup", { url: WEBAPP_URL });
}).catch((err) => {
  logger.error("Error setting custom menu button at startup", { error: err.message });
});

// Команда /start
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received /start command", { userId });

  // Проверяем админ-права
  const isAdmin = await isAdminUser(userId);
  logger.info("Admin check completed", { userId, isAdmin });

  // Повторно устанавливаем кнопку "Open App" для этого чата
  try {
    await ctx.telegram.setChatMenuButton({
      chat_id: ctx.chat.id,
      type: "web_app",
      text: "Open App",
      web_app: { url: WEBAPP_URL },
    });
    logger.info("Custom menu button 'Open App' set for chat", { chatId: ctx.chat.id, url: WEBAPP_URL });
  } catch (err) {
    logger.error("Error setting custom menu button for chat", { chatId: ctx.chat.id, error: err.message });
  }

  // Inline-кнопка "Открыть магазин" для всех пользователей
  const inlineButtons = [[{ text: "🛒 Открыть магазин", web_app: { url: WEBAPP_URL } }]];

  // Reply Keyboard для админов
  let replyMarkup = { inline_keyboard: inlineButtons };

  if (isAdmin) {
    replyMarkup = {
      inline_keyboard: inlineButtons, // Сохраняем inline-кнопку
      keyboard: [
        ["📦 Парсер товаров", "✏️ Редактировать товары"],
        ["👁️ Управление видимостью", "👤 Добавить админа"],
        ["📋 Просмотреть товары", "💰 Массовая наценка"],
        ["⬅️ Скрыть меню"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };
    logger.info("Admin reply keyboard added", { userId });
  }

  try {
    await ctx.reply("✨ Добро пожаловать в магазин постельного белья! Выберите действие:", {
      reply_markup: replyMarkup,
    });
    logger.info("Sent /start response", { userId, isAdmin });
  } catch (err) {
    logger.error("Error sending /start response", { error: err.message, userId });
    await ctx.reply("❌ Ошибка отправки ответа: " + err.message);
  }
});

// Скрыть меню
bot.hears("⬅️ Скрыть меню", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received hide menu command", { userId });

  try {
    await ctx.reply("Меню скрыто. Чтобы показать его снова, отправьте /start", {
      reply_markup: { remove_keyboard: true },
    });
    logger.info("Reply keyboard hidden", { userId });
  } catch (err) {
    logger.error("Error hiding menu", { error: err.message, userId });
    await ctx.reply("❌ Ошибка: " + err.message);
  }
});

// Парсер товаров
bot.hears("📦 Парсер товаров", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received parse_products command", { userId });

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    logger.warn("Admin access denied for parse_products", { userId });
    return;
  }

  try {
    await ctx.reply("📤 Отправьте CSV-файл с товарами. Бот распознает столбцы (например, name, price, description).");
    logger.info("Prompted for CSV upload", { userId });
  } catch (err) {
    logger.error("Error in parse_products", { error: err.message, userId });
    await ctx.reply("❌ Ошибка: " + err.message);
  }
});

bot.on("document", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received document", { userId });

  const isAdmin = await isAdminUser(userId);
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
      await resetProductsCache();
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

// Редактировать товары
bot.hears("✏️ Редактировать товары", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received edit_products command", { userId });

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    logger.warn("Admin access denied for edit_products", { userId });
    return;
  }

  try {
    await ctx.reply(
      "✏️ Введите: id,название,цена,описание,категория,остаток,теги (оставьте пустым для текущего значения)\nПример: 123,Простыня,1500,Белая простыня,постель,10,хлопок"
    );
  } catch (err) {
    logger.error("Error in edit_products", { error: err.message, userId });
    await ctx.reply("❌ Ошибка: " + err.message);
  }
});

// Управление видимостью
bot.hears("👁️ Управление видимостью", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received toggle_visibility command", { userId });

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    logger.warn("Admin access denied for toggle_visibility", { userId });
    return;
  }

  try {
    await ctx.reply("👁️ Введите: visibility,id,true/false\nПример: visibility,123,true");
  } catch (err) {
    logger.error("Error in toggle_visibility", { error: err.message, userId });
    await ctx.reply("❌ Ошибка: " + err.message);
  }
});

// Добавить админа
bot.hears("👤 Добавить админа", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received add_admin command", { userId });

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    logger.warn("Admin access denied for add_admin", { userId });
    return;
  }

  try {
    await ctx.reply("👤 Введите Telegram ID нового админа (например, 123456789)");
  } catch (err) {
    logger.error("Error in add_admin", { error: err.message, userId });
    await ctx.reply("❌ Ошибка: " + err.message);
  }
});

// Просмотреть товары
bot.hears("📋 Просмотреть товары", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received view_products command", { userId });

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    logger.warn("Admin access denied for view_products", { userId });
    await ctx.reply("🚫 Доступ запрещён");
    return;
  }

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

// Массовая наценка
bot.hears("💰 Массовая наценка", async (ctx) => {
  const userId = ctx.from.id.toString();
  logger.info("Received bulk_price command", { userId });

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    logger.warn("Admin access denied for bulk_price", { userId });
    return;
  }

  try {
    await ctx.reply("💰 Введите: bulk,percent/fixed,значение\nПример: bulk,percent,10");
  } catch (err) {
    logger.error("Error in bulk_price", { error: err.message, userId });
    await ctx.reply("❌ Ошибка: " + err.message);
  }
});

// Обработка текстовых команд
bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;
  logger.info("Received text message", { userId, text });

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    logger.warn("Admin access denied for text command", { userId });
    return;
  }

  try {
    // Проверяем формат команды редактирования (id,название,цена,...)
    const editMatch = text.match(/^(\d+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*(?:(\d+),)?\s*(.*)?$/);
    if (editMatch) {
      const [, id, name, price, description, category, stock, tags] = editMatch;
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
      await ctx.reply(`✅ Админ с ID ${text} добавлен! Новый админ должен отправить /start`);
      logger.info("Admin added", { userId, newAdminId: text });
    } else {
      await ctx.reply("❌ Неверный формат команды. Используйте примеры из инструкций.");
      logger.warn("Invalid command format", { userId, text });
    }
  } catch (err) {
    logger.error("Error in text handler", { error: err.message, userId, text });
    await ctx.reply("❌ Ошибка: " + err.message);
  }
});