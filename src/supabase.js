import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import retry from "async-retry";
import { logger } from "./utils.js";

// Загрузка переменных окружения
dotenv.config();

const SUPABASE_ENABLED = process.env.SUPABASE_ENABLED === "true";

// Инициализация Supabase
const supabase = SUPABASE_ENABLED
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
      fetch: (url, options) =>
        fetch(url, { ...options, timeout: 5000 }).catch((err) => {
          logger.error("Supabase fetch failed", { error: err.message });
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
    throw err;
  });
};

// Проверка админ-прав
export const isAdminUser = async (userId) => {
  const adminIdsFromEnv = process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(",").map((id) => id.trim())
    : [];
  if (adminIdsFromEnv.includes(userId)) {
    logger.info("Admin access granted via ADMIN_IDS", { userId });
    return true;
  }

  if (!SUPABASE_ENABLED) {
    logger.warn("Supabase check skipped", { userId });
    throw new Error("Supabase disabled");
  }

  try {
    const tableExists = await checkTable("admins");
    if (!tableExists) {
      logger.warn("Admins table is inaccessible or RLS is not configured", { userId });
      throw new Error("Admins table inaccessible");
    }

    const { data: admins, error } = await supabase.from("admins").select("user_id");
    if (error) {
      logger.error("Supabase error checking admins", { error, userId });
      throw new Error(error.message);
    }

    const isAdmin = admins && admins.some((admin) => admin.user_id === userId);
    logger.info("Supabase admin check result", { userId, isAdmin });
    return isAdmin;
  } catch (err) {
    logger.error("Error checking admin status", { error: err.message, userId });
    throw err;
  }
};

// Получение видимых товаров с кэшированием
export const getVisibleProducts = async () => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const now = Date.now();
  if (productsCache && now - cacheTimestamp < CACHE_DURATION) {
    logger.info("Returning cached products");
    return productsCache;
  }

  const { data, error } = await supabase.from("products").select("*").eq("is_visible", true);
  if (error) {
    logger.error("Supabase error fetching visible products", { error });
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
    logger.error("Supabase error fetching all products", { error });
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
    logger.error("Error fetching product for update", { error: fetchError, id });
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
    logger.error("Error updating product", { error: updateError, id });
    throw new Error(updateError.message);
  }

  resetProductsCache();
};

// Массовая наценка
export const bulkUpdatePrices = async (type, value) => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { data: products, error: fetchError } = await supabase.from("products").select("*");
  if (fetchError) {
    logger.error("Error fetching products for bulk update", { error: fetchError });
    throw new Error(fetchError.message);
  }

  const updatedProducts = products.map((product) => ({
    ...product,
    price: type === "percent" ? product.price * (1 + value / 100) : product.price + value,
  }));

  const { error: updateError } = await supabase.from("products").upsert(updatedProducts);
  if (updateError) {
    logger.error("Error updating prices in bulk", { error: updateError });
    throw new Error(updateError.message);
  }

  resetProductsCache();
};

// Управление видимостью
export const toggleProductVisibility = async (id, isVisible) => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { error } = await supabase.from("products").update({ is_visible: isVisible }).eq("id", id);
  if (error) {
    logger.error("Error updating visibility", { error, id });
    throw new Error(error.message);
  }

  resetProductsCache();
};

// Добавление админа
export const addAdmin = async (userId) => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { error } = await supabase.from("admins").insert({ user_id: userId });
  if (error) {
    logger.error("Error adding admin", { error, newAdminId: userId });
    throw new Error(error.message);
  }
};

// Тест подключения
export const testSupabaseConnection = async () => {
  if (!SUPABASE_ENABLED) throw new Error("Supabase disabled");

  const { data, error } = await supabase.from("admins").select("user_id");
  if (error) {
    logger.error("Supabase error in test connection", { error });
    throw new Error(error.message);
  }
  return { data, error };
};