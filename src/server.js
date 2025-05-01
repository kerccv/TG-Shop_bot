import express from "express";
import path from "path";
import cors from "cors";
import * as dotenv from "dotenv";
import { bot } from "./bot.js";
import { logger } from "./utils.js";
import { getVisibleProducts, testSupabaseConnection } from "./supabase.js";

// Загрузка переменных окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.resolve();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/webapp", express.static(path.join(__dirname, "webapp")));
app.use("/public", express.static(path.join(__dirname, "public")));

// Webhook для Telegram
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
  logger.info("Webhook request processed");
});

// API для веб-приложения
app.get("/api/products", async (req, res) => {
  logger.info("Received /api/products request");
  try {
    const products = await getVisibleProducts();
    res.json(products);
  } catch (err) {
    logger.error("Error in /api/products", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Тестовое подключение к Supabase
app.get("/test-supabase", async (req, res) => {
  logger.info("Received /test-supabase request");
  try {
    const result = await testSupabaseConnection();
    res.json(result);
  } catch (err) {
    logger.error("Error in /test-supabase", { error: err.message });
    res.status(500).json({ error: err.message });
  }
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