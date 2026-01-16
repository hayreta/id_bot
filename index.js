require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const os = require('os');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';

// --- Database Logic ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], startTime: Date.now() }));
const db = JSON.parse(fs.readFileSync(DB_FILE));

function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

// Track user activity
bot.use((ctx, next) => {
    if (ctx.from) saveUser(ctx.from.id);
    return next();
});

// --- Welcome Message ---
bot.start((ctx) => {
    const welcomeMsg = 
        `👋 Welcome to ID Bot!\n\n` +
        `🔹 Use this bot to get the User, Bot, Group, or Channel ID in any of these ways:\n` +
        `✅ Forward a message\n` +
        `✅ Share a chat using the button\n` +
        `✅ Share a contact\n` +
        `✅ Forward a story\n` +
        `✅ Reply from another chat\n\n` +
        `📌 Simply send or share, and I'll provide the ID you need!\n\n` +
        `Your Id: ${ctx.from.id}`;

    let buttons = [
        [Markup.button.userRequest('👤 User', 1), Markup.button.botRequest('🤖 Bot', 2)],
        [Markup.button.groupRequest('📢 Group', 3), Markup.button.channelRequest('📺 Channel', 4)],
        ['🔍 Check by ID']
    ];
    if (ctx.from.id === ADMIN_ID) buttons.push(['⚙️ Admin Panel']);

    ctx.reply(welcomeMsg, Markup.keyboard(buttons).resize());
});

// --- Admin Panel ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(`📊 Users: ${db.users.length}`, Markup.inlineKeyboard([
        [Markup.button.callback('📢 Start Broadcast', 'start_broadcast')]
    ]));
});

// --- Enhanced Broadcast Logic ---
bot.action('start_broadcast', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("📸 Send me ANYTHING (Text, Image, or Forward a message) to broadcast it to all users:");
    bot.context.isBroadcasting = true;
});

bot.on('message', async (ctx, next) => {
    // If not admin or not in broadcast mode, skip
    if (ctx.from.id !== ADMIN_ID || !bot.context.isBroadcasting) return next();

    bot.context.isBroadcasting = false; 
    const users = db.users;
    let success = 0;
    const statusMsg = await ctx.reply(`🚀 Broadcasting to ${users.length} users...`);

    for (let userId of users) {
        try {
            // copyMessage works for text, photo, video, and forwarded posts!
            await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id);
            success++;
        } catch (e) {
            // User might have blocked the bot
        }
    }

    ctx.reply(`✅ Broadcast Complete! Sent to ${success} users.`);
});

// --- ID Lookup Handlers ---
bot.hears('🔍 Check by ID', (ctx) => ctx.reply("Send ID:"));
bot.on('chat_shared', (ctx) => ctx.reply(`ID: ${ctx.message.chat_shared.chat_id}`));
bot.on('user_shared', (ctx) => ctx.reply(`ID: ${ctx.message.user_shared.user_id}`));

// Final catch-all for ID logic
bot.on('message', async (ctx) => {
    const msg = ctx.message;
    // Manual ID check
    if (msg.text && /^-?\d+$/.test(msg.text)) {
        try {
            const chat = await bot.telegram.getChat(msg.text);
            return ctx.reply(`ID: ${chat.id}\nName: ${chat.first_name || chat.title}`);
        } catch (e) { return ctx.reply("Not found."); }
    }
    // Forwards/Contacts
    if (msg.forward_from_chat) return ctx.reply(`ID: ${msg.forward_from_chat.id}`);
    if (msg.forward_from) return ctx.reply(`ID: ${msg.forward_from.id}`);
    if (msg.contact) return ctx.reply(`ID: ${msg.contact.user_id}`);
    
    ctx.reply(`Your Id: ${ctx.from.id}`);
});

bot.launch();
