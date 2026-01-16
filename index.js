require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Start Command with the Keyboard shown in your image
bot.start((ctx) => {
    const welcomeMsg = 
        "👋 Welcome to ID Bot!\n\n" +
        "🔹 Use this bot to get the User, Bot, Group, or Channel ID in any of these ways:\n" +
        "✅ Forward a message\n" +
        "✅ Share a chat using the button\n" +
        "✅ Share a contact\n" +
        "✅ Forward a story\n" +
        "✅ Reply from another chat\n\n" +
        "📌 Simply send or share, and I'll provide the ID you need!";

    // Creating the 2x2 grid keyboard
    return ctx.reply(welcomeMsg, Markup.keyboard([
        [
            Markup.button.userRequest('👤 User', 1),
            Markup.button.botRequest('🤖 Bot', 2)
        ],
        [
            Markup.button.groupRequest('📢 Group', 3),
            Markup.button.channelRequest('📺 Channel', 4)
        ]
    ]).resize());
});

// 2. Handler for shared chats (when buttons are clicked)
bot.on('chat_shared', (ctx) => {
    const id = ctx.message.chat_shared.chat_id;
    ctx.reply(`Target ID: ${id}`);
});

bot.on('user_shared', (ctx) => {
    const id = ctx.message.user_shared.user_id;
    ctx.reply(`Target ID: ${id}`);
});

// 3. Handler for messages, forwards, and contacts
bot.on('message', async (ctx) => {
    const msg = ctx.message;

    // Handle standard message (Your ID)
    if (!msg.forward_from && !msg.forward_from_chat && !msg.contact) {
        return ctx.reply(`Your Id: ${msg.from.id}`);
    }

    // Handle Forwarded from User/Bot
    if (msg.forward_from) {
        return ctx.reply(`Forwarded User/Bot Id: ${msg.forward_from.id}`);
    }

    // Handle Forwarded from Channel
    if (msg.forward_from_chat) {
        return ctx.reply(`Forwarded Chat Id: ${msg.forward_from_chat.id}`);
    }

    // Handle Contact Share
    if (msg.contact) {
        return ctx.reply(`Contact User Id: ${msg.contact.user_id}`);
    }
});

bot.launch().then(() => console.log("🚀 ID Bot matches UI and is running!"));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
