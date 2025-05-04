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

// Настройка Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Настройка Telegram Bot
const botToken = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;

// Статические файлы (HTML, CSS, JS)
app.use(express.static(path.join(process.cwd(), 'public')));

// Маршрут для получения всех продуктов
app.get('/api/products', async (req, res) => {
    try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Ошибка получения продуктов:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении продуктов' });
    }
});

// Маршрут для сохранения заказа и отправки уведомления админу
app.post('/api/orders', async (req, res) => {
    try {
        const { userId, orderDetails, userInfo } = req.body;

        // Сохранение заказа в Supabase
        const { data, error } = await supabase
            .from('orders')
            .insert({ user_id: userId, order_details: orderDetails, user_info: userInfo })
            .select();
        if (error) throw error;

        // Формирование сообщения для админа
        const itemsText = orderDetails.map(item => 
            `Товар: ${item.name}, Цена: ${item.price} грн, Кол-во: ${item.quantity}`
        ).join('\n');
        const userText = `
Информация о пользователе:
ФИО: ${userInfo.fullName}
Телефон: ${userInfo.phone}
Тип оплаты: ${userInfo.paymentType}
Адрес: Украина, ${userInfo.region}, ${userInfo.city}, ул. ${userInfo.street}, дом ${userInfo.house}, кв. ${userInfo.apartment}, этаж ${userInfo.floor}
        `;
        const message = `Новый заказ:\n\n${itemsText}\n\n${userText}`;

        // Отправка уведомления админу через Telegram Bot
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: adminChatId,
                text: message
            })
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка обработки заказа:', error);
        res.status(500).json({ error: 'Ошибка сервера при обработке заказа' });
    }
});

app.listen(3000, () => {
    console.log('Сервер запущен на порту 3000');
});