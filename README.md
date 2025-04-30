# 🛍️ Lavander & Sleep (tg-shop)

Бот для продажи товаров в Telegram с корзиной, оплатой и админ-панелью.
Написан на Node.js (Telegraf.js), использует Supabase для хранения данных.

![Version](https://img.shields.io/badge/version-1.0-violet) 

## ⚙️ Установка и запуск

# Требования
1. Node.js v16+
2. npm или yarn
3. Telegram Bot Token (получить у @BotFather)

# 1. Клонирование и установка зависимостей
   ```bash
git clone https://github.com/kerccv/TG-Shop_bot.git
cd TG-Shop_bot
npm install  # или yarn install
   ```

# 2. Настройка конфигурации
Создайте файл .env в корне проекта и заполните по образцу:

ini
WEBAPP_URL=url_вашего_веб-приложения
RENDER_EXTERNAL_HOSTNAME=url_хоста(в моём случае render.com)
BOT_TOKEN=token_бота
SUPABASE_URL=url_supabase
ADMIN_IDS=айди_админов
SUPABASE_KEY=секретный_ключ_supabase

# 3. Создание проэкта на supabase (если хост render.com то ещё и его)
1. Настройка supabase:
  1) Создайте проэкт, добавляете пароль.
  2) Создайте таблицы admins, products
     
2. Настройка render:
  1) Создайте новый Web Service
  2) Укажите свой репозиторий
Build Command:
```bash
     cd bot && npm install
   ```

Start Command
        ```bash
     node bot/index.js
        ```
