require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

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
        `👋 <b>Welcome to ID Bot!</b>\n\n` +
        `🔹 Use this bot to get IDs in any of these ways:\n` +
        `✅ Forward a message\n` +
        `✅ Share a chat using the button\n` +
        `✅ Share a contact\n` +
        `✅ Forward a story\n\n` +
        `Your Id: <code>${ctx.from.id}</code>`;

    let buttons = [
        [Markup.button.userRequest('👤 User', 1), Markup.button.botRequest('🤖 Bot', 2)],
        [Markup.button.groupRequest('📢 Group', 3), Markup.button.channelRequest('📺 Channel', 4)],
        ['🔍 Check by ID']
    ];
    if (ctx.from.id === ADMIN_ID) buttons.push(['⚙️ Admin Panel']);

    ctx.reply(welcomeMsg, { parse_mode: 'HTML', ...Markup.keyboard(buttons).resize() });
});

// --- Admin Panel ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(`📊 Users: ${db.users.length}`, Markup.inlineKeyboard([
        [Markup.button.callback('📢 Start Broadcast', 'start_broadcast')]
    ]));
});

// --- Broadcast Logic ---
bot.action('start_broadcast', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("📸 Send anything to broadcast:");
    bot.context.isBroadcasting = true;
});

// --- ID Lookup Handlers ---
bot.hears('🔍 Check by ID', (ctx) => ctx.reply("Send ID:"));
bot.on('chat_shared', (ctx) => ctx.reply(`ID: <code>${ctx.message.chat_shared.chat_id}</code>`, { parse_mode: 'HTML' }));
bot.on('user_shared', (ctx) => ctx.reply(`ID: <code>${ctx.message.user_shared.user_id}</code>`, { parse_mode: 'HTML' }));

// Final catch-all for ID logic
bot.on('message', async (ctx, next) => {
    if (ctx.from.id === ADMIN_ID && bot.context.isBroadcasting) {
        bot.context.isBroadcasting = false; 
        for (let userId of db.users) {
            try { await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id); } catch (e) {}
        }
        return ctx.reply("✅ Broadcast Complete!");
    }

    const msg = ctx.message;

    if (msg.text && /^-?\d+$/.test(msg.text)) {
        try {
            const chat = await bot.telegram.getChat(msg.text);
            return ctx.reply(`ID: <code>${chat.id}</code>\nName: ${chat.first_name || chat.title}`, { parse_mode: 'HTML' });
        } catch (e) { return ctx.reply("Not found."); }
    }

    if (msg.forward_from_chat) return ctx.reply(`ID: <code>${msg.forward_from_chat.id}</code>`, { parse_mode: 'HTML' });
    if (msg.forward_from) return ctx.reply(`ID: <code>${msg.forward_from.id}</code>`, { parse_mode: 'HTML' });
    if (msg.contact) return ctx.reply(`ID: <code>${msg.contact.user_id}</code>`, { parse_mode: 'HTML' });
    
    ctx.reply(`Your Id: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
});

bot.launch();
