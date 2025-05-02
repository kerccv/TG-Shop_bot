import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import retry from "async-retry";
import { logger } from "./utils.js";

// Загрузка переменных окружения
dotenv.config();

const SUPABASE_ENABLED = process.env.SUPABASE_ENABLED === "true";

// Логирование переменных окружения (без ключей для безопасности)
logger.info("Supabase configuration", {
  SUPABASE_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL ? "Set" : "Not set",
  SUPABASE_KEY: process.env.SUPABASE_KEY ? "Set" : "Not set",
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(",").map(id => id.trim()) : "Not set",
});

// Инициализация Supabase
const supabase = SUPABASE_ENABLED
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
      fetch: (url, options) =>
        fetch(url, { ...options, timeout: 5000 }).catch((err) => {
          logger.error("Supabase fetch failed", { error: err.message, url });
          throw err;
        }),
    })
  : null;

// Кэш для товаров
let productsCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

// Проверка таблицы
const checkTable = async (tableName) => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  return await retry(
    async () => {
      const { data, error } = await supabase.from(tableName).select("*").limit(1);
      if (error) {
        logger.error(`Error checking table ${tableName}`, { error: error.message, details: error.details });
        throw new Error(error.message);
      }
      logger.info(`Table ${tableName} check successful`, { rowCount: data?.length || 0 });
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
    throw err;
  });
};

// Проверка админ-прав
export const isAdminUser = async (userId) => {
  const adminIdsFromEnv = process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(",").map((id) => id.trim())
    : [];
  logger.info("Checking admin status", { userId, adminIdsFromEnv });

  // Проверяем сначала в ADMIN_IDS
  if (adminIdsFromEnv.includes(userId)) {
    logger.info("Admin access granted via ADMIN_IDS", { userId });
    return true;
  }

  if (!SUPABASE_ENABLED) {
    logger.warn("Supabase check skipped", { userId });
    return false;
  }

  try {
    const { data: admins, error } = await supabase.from("admins").select("user_id");
    if (error) {
      logger.error("Supabase error checking admins", { error: error.message, details: error.details, userId });
      return false;
    }

    const adminList = admins.map(admin => admin.user_id.toString());
    const isAdmin = adminList.includes(userId.toString());
    logger.info("Supabase admin check result", { userId, isAdmin, adminList });
    return isAdmin;
  } catch (err) {
    logger.error("Error checking admin status", { error: err.message, userId });
    return false;
  }
};

// Получение видимых товаров с кэшированием
export const getVisibleProducts = async () => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const now = Date.now();
  if (productsCache && now - cacheTimestamp < CACHE_DURATION) {
    logger.info("Returning cached products", { count: productsCache.length });
    return productsCache;
  }

  const { data, error } = await supabase.from("products").select("*").eq("is_visible", true);
  if (error) {
    logger.error("Supabase error fetching visible products", { error: error.message, details: error.details });
    throw new Error(error.message);
  }

  productsCache = data || [];
  cacheTimestamp = now;
  logger.info("Fetched and cached products", { count: productsCache.length });
  return productsCache;
};

// Сброс кэша
export const resetProductsCache = () => {
  productsCache = null;
  cacheTimestamp = 0;
  logger.info("Products cache reset");
};

// Получение всех товаров
export const getAllProducts = async () => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { data, error } = await supabase.from("products").select("*");
  if (error) {
    logger.error("Supabase error fetching all products", { error: error.message, details: error.details });
    throw new Error(error.message);
  }
  return data || [];
};

// Обновление товара
export const updateProduct = async (id, updates) => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { data: product, error: fetchError } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !product) {
    logger.error("Error fetching product for update", { error: fetchError?.message, details: fetchError?.details, id });
    throw new Error("Товар не найден");
  }

  const updatedProduct = {
    name: updates.name || product.name,
    price: updates.price !== undefined ? updates.price : product.price,
    description: updates.description || product.description,
    category: updates.category || product.category,
    stock: updates.stock !== undefined ? updates.stock : product.stock,
    tags: updates.tags || product.tags,
  };

  const { error: updateError } = await supabase.from("products").update(updatedProduct).eq("id", id);
  if (updateError) {
    logger.error("Error updating product", { error: updateError.message, details: updateError.details, id });
    throw new Error(updateError.message);
  }

  resetProductsCache();
};

// Массовая наценка
export const bulkUpdatePrices = async (type, value) => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { data: products, error: fetchError } = await supabase.from("products").select("*");
  if (fetchError) {
    logger.error("Error fetching products for bulk update", { error: fetchError.message, details: fetchError.details });
    throw new Error(fetchError.message);
  }

  const updatedProducts = products.map((product) => ({
    ...product,
    price: type === "percent" ? product.price * (1 + value / 100) : product.price + value,
  }));

  const { error: updateError } = await supabase.from("products").upsert(updatedProducts);
  if (updateError) {
    logger.error("Error updating prices in bulk", { error: updateError.message, details: updateError.details });
    throw new Error(updateError.message);
  }

  resetProductsCache();
};

// Управление видимостью
export const toggleProductVisibility = async (id, isVisible) => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  // Проверяем, существует ли товар
  const { data: product, error: fetchError } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !product) {
    logger.error("Error fetching product for visibility update", { error: fetchError?.message, details: fetchError?.details, id });
    throw new Error("Товар не найден");
  }

  const { error } = await supabase.from("products").update({ is_visible: isVisible }).eq("id", id);
  if (error) {
    logger.error("Error updating visibility", { error: error.message, details: error.details, id });
    throw new Error(error.message);
  }

  resetProductsCache();
};

// Добавление админа
export const addAdmin = async (userId) => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { error } = await supabase.from("admins").insert({ user_id: userId });
  if (error) {
    logger.error("Error adding admin", { error: error.message, details: error.details, newAdminId: userId });
    throw new Error(error.message);
  }
};

// Тест подключения
export const testSupabaseConnection = async () => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { data, error } = await supabase.from("admins").select("user_id");
  if (error) {
    logger.error("Supabase error in test connection", { error: error.message, details: error.details });
    throw new Error(error.message);
  }
  return { data, error };
};