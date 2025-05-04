import dotenv from 'dotenv';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import path from 'path';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Логирование всех входящих запросов для отладки
app.use((req, res, next) => {
    console.log(`Получен запрос: ${req.method} ${req.url}`);
    next();
});

// Настройка Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Ошибка: SUPABASE_URL или SUPABASE_KEY не заданы в переменных окружения');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Проверка подключения к Supabase при старте сервера
async function testSupabaseConnection() {
    try {
        const { data, error } = await supabase.from('products').select('id').limit(1);
        if (error) throw error;
        console.log('Подключение к Supabase успешно, данные из products:', data);
    } catch (error) {
        console.error('Ошибка подключения к Supabase:', error.message);
    }
}

testSupabaseConnection();

// Настройка Telegram Bot
const botToken = process.env.BOT_TOKEN;
const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];

if (!botToken || adminIds.length === 0) {
    console.error('Ошибка: BOT_TOKEN или ADMIN_IDS не заданы в переменных окружения');
}

// Middleware для проверки прав админа
function checkAdmin(req, res, next) {
    const userId = req.body.userId || req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: 'userId не указан' });
    }
    if (!adminIds.includes(userId.toString())) {
        return res.status(403).json({ error: 'Доступ запрещён: вы не админ' });
    }
    next();
}

// Маршрут для получения всех продуктов
app.get('/api/products', async (req, res) => {
    console.log('Запрос на /api/products');
    try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) {
            console.error('Ошибка Supabase:', error);
            throw error;
        }
        console.log('Успешно получены продукты:', data);
        res.json(data);
    } catch (error) {
        console.error('Ошибка получения продуктов:', error.message);
        res.status(500).json({ error: `Ошибка сервера при получении продуктов: ${error.message}` });
    }
});

// Маршрут для сохранения заказа и отправки уведомления админу
app.post('/api/orders', async (req, res) => {
    console.log('Запрос на /api/orders, тело запроса:', req.body);
    try {
        const { userId, orderDetails, userInfo } = req.body;

        if (!userId || !orderDetails || !userInfo) {
            throw new Error('Отсутствуют обязательные поля: userId, orderDetails или userInfo');
        }

        const { data, error } = await supabase
            .from('orders')
            .insert({
                user_id: userId,
                order_details: orderDetails,
                user_info: userInfo,
                created_at: new Date().toISOString()
            })
            .select();
        if (error) {
            console.error('Ошибка Supabase при сохранении заказа:', error);
            throw error;
        }
        console.log('Заказ успешно сохранён:', data);

        const itemsText = orderDetails.map(item => 
            `Товар: ${item.name || 'Без названия'}, Цена: ${item.price || 0} грн, Кол-во: ${item.quantity || 1}`
        ).join('\n');
        const userText = `
Информация о пользователе:
ФИО: ${userInfo.fullName || 'Не указано'}
Телефон: ${userInfo.phone || 'Не указан'}
Тип оплаты: ${userInfo.paymentType || 'Не указан'}
Адрес: Украина, ${userInfo.region || 'Не указан'}, ${userInfo.city || 'Не указан'}, ул. ${userInfo.street || 'Не указана'}, дом ${userInfo.house || 'Не указан'}, кв. ${userInfo.apartment || 'Не указан'}, этаж ${userInfo.floor || 'Не указан'}
        `;
        const message = `Новый заказ:\n\n${itemsText}\n\n${userText}`;

        for (const adminId of adminIds) {
            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: adminId,
                    text: message
                })
            });
            if (!response.ok) {
                console.error(`Ошибка отправки сообщения админу ${adminId}:`, await response.text());
            } else {
                console.log(`Сообщение отправлено админу ${adminId}`);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка обработки заказа:', error.message);
        res.status(500).json({ error: `Ошибка сервера при обработке заказа: ${error.message}` });
    }
});

// Маршрут для открытия магазина (админ)
app.post('/api/admin/open-store', checkAdmin, async (req, res) => {
    console.log('Запрос на /api/admin/open-store от пользователя:', req.body.userId);
    try {
        const { data, error } = await supabase
            .from('settings')
            .update({ store_open: true })
            .eq('id', 1)
            .select();
        if (error) {
            console.error('Ошибка Supabase при открытии магазина:', error);
            throw error;
        }
        console.log('Магазин успешно открыт:', data);

        for (const adminId of adminIds) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: adminId,
                    text: `Магазин открыт пользователем ${req.body.userId}!`
                })
            });
        }

        res.json({ success: true, message: 'Магазин открыт' });
    } catch (error) {
        console.error('Ошибка при открытии магазина:', error.message);
        res.status(500).json({ error: `Ошибка сервера: ${error.message}` });
    }
});

// Маршрут для доступа к админ-панели (админ)
app.get('/api/admin/panel', checkAdmin, async (req, res) => {
    console.log('Запрос на /api/admin/panel от пользователя:', req.query.userId);
    try {
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('*');
        if (productsError) throw productsError;

        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        if (ordersError) throw ordersError;

        res.json({
            success: true,
            products,
            orders
        });
    } catch (error) {
        console.error('Ошибка при загрузке данных админ-панели:', error.message);
        res.status(500).json({ error: `Ошибка сервера: ${error.message}` });
    }
});

// Настройка раздачи статических файлов из папки webapp
app.use(express.static(path.join(process.cwd(), 'webapp')));

// Динамическая маршрутизация для HTML-страниц
app.get('/*', (req, res) => {
    const filePath = path.join(process.cwd(), 'webapp', req.path === '/' ? 'index.html' : req.path);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.log(`Файл не найден: ${filePath}, возвращаем index.html`);
            res.status(404).sendFile(path.join(process.cwd(), 'webapp', 'index.html'));
        }
    });
});

app.listen(3000, () => {
    console.log('Сервер запущен на порту 3000');
});