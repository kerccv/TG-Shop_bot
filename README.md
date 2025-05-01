🛒 TG-Shop Bot
  
TG-Shop Bot — это Telegram-бот для управления интернет-магазином постельного белья. Он позволяет пользователям просматривать товары, а администраторам — управлять каталогом, парсить товары из CSV, редактировать их и управлять видимостью. Бот интегрируется с Supabase для хранения данных и предоставляет веб-интерфейс для покупателей.

✨ Особенности

🛍️ Каталог товаров: Просмотр товаров через веб-интерфейс.
🔑 Админ-панель: Управление товарами, видимостью, ценами и админами.
📦 Парсер CSV: Импорт товаров из CSV-файлов.
⚡ Быстрая работа: Оптимизированный код с асинхронными запросами.
📜 Логирование: Профессиональное логирование с помощью Winston.
🛠️ Масштабируемость: Модульная структура для лёгкого расширения.


📋 Требования

Node.js (v16+)
Telegram-бот (токен от BotFather)
Supabase (для хранения данных)
Render или другой хостинг для деплоя


🛠️ Установка

Клонируйте репозиторий:
git clone https://github.com/kerccv/TG-Shop_bot.git
cd TG-Shop_bot


Установите зависимости:
npm install


Настройте переменные окружения:Создайте файл .env на основе .env.example:
BOT_TOKEN=ваш_токен_бота
WEBAPP_URL=https://ваш_домен/webapp/index.html
RENDER_EXTERNAL_HOSTNAME=ваш_домен
SUPABASE_URL=https://ваш_supabase_url
SUPABASE_KEY=ваш_anon_ключ
ADMIN_IDS=ваш_telegram_id
SUPABASE_ENABLED=true


Запустите локально (для теста):
npm start




🚀 Деплой на Render

Создайте сервис на Render:

Выберите Node как среду.
Укажите репозиторий: https://github.com/kerccv/TG-Shop_bot.


Настройте переменные окружения:В разделе Environment добавьте переменные из .env.

Укажите команды:

Build Command: npm install
Start Command: npm start


Разверните:Нажмите Deploy и дождитесь завершения.



🖥️ Использование
Для пользователей

Отправьте команду /start в Telegram.
Нажмите 🛒 Открыть магазин, чтобы просмотреть товары.

Для админов

После /start появится кнопка 🔑 Админ-панель (для ID из ADMIN_IDS).
Доступные действия:
📦 Парсер товаров: Загрузите CSV-файл с товарами.
✏️ Редактировать товары: Команда edit,id,название,цена,описание,категория,остаток,теги.
👁️ Управление видимостью: Команда visibility,id,true/false.
👤 Добавить админа: Введите Telegram ID.
📋 Просмотреть товары: Список всех товаров.
💰 Массовая наценка: Команда bulk,percent/fixed,значение.




📦 Структура проекта

bot/index.js — Основной скрипт бота (Telegraf + Express).
webapp/index.html — Веб-интерфейс магазина.
public/styles.css — Стили для веб-интерфейса.
logs/ — Логи (error.log, combined.log).
.env — Переменные окружения.


🔧 Настройка Supabase

Создайте таблицы в Supabase:
CREATE TABLE admins (
  user_id TEXT PRIMARY KEY
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price FLOAT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT,
  stock INTEGER,
  tags TEXT[],
  is_visible BOOLEAN DEFAULT FALSE
);


Включите RLS и настройте политики:
-- Для admins
CREATE POLICY "Allow anon read admins" ON "public"."admins" FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write admins" ON "public"."admins" FOR ALL TO anon USING (true) WITH CHECK (true);

-- Для products
CREATE POLICY "Allow anon read products" ON "public"."products" FOR SELECT TO anon USING (is_visible = true);
CREATE POLICY "Allow anon write products" ON "public"."products" FOR ALL TO anon USING (true) WITH CHECK (true);


Добавьте тестовые данные:
INSERT INTO admins (user_id) VALUES ('7478829239');
INSERT INTO products (id, name, price, category, stock, is_visible)
VALUES ('test-1', 'Тестовый комплект белья', 2999, 'Комплекты', 10, TRUE);




🐞 Отладка

Логи: Проверяйте logs/error.log и logs/combined.log.
Тест Supabase: Откройте https://ваш_домен/test-supabase.
Webhook: Проверьте с помощью:https://api.telegram.org/bot<токен>/getWebhookInfo




🤝 Контрибьютинг

Форкните репозиторий.
Создайте ветку: git checkout -b feature/название.
Сделайте изменения и закоммитьте: git commit -m "Добавлено ...".
Запушьте: git push origin feature/название.
Создайте Pull Request.


📜 Лицензия
Проект распространяется под лицензией MIT. Подробности в файле LICENSE.

📧 Контакты

Автор: kerccv
GitHub: kerccv
Telegram: @kerccv


🌟 Спасибо за использование TG-Shop Bot! Если у вас есть вопросы, пишите в issues!
