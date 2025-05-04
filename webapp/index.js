import { bot } from './bot.js';
import { logger } from './utils.js';

async function startServer() {
  try {
    // Запускаем бота
    await bot.launch();
    logger.info('Bot is running...');

    // Остановка бота при завершении процесса
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (err) {
    logger.error('Error starting bot:', { error: err.message });
    process.exit(1);
  }
}

startServer();