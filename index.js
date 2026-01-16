require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const os = require('os');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';

// --- Simple Database Logic ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], startTime: Date.now() }));
const db = JSON.parse(fs.readFileSync(DB_FILE));

function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

// --- Helper: Uptime Calculator ---
function getUptime() {
    const uptimeSec = Math.floor((Date.now() - db.startTime) / 1000);
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    return `${hours}h ${mins}m`;
}

// Save user on every message
bot.use((ctx, next) => {
    if (ctx.from) saveUser(ctx.from.id);
    return next();
});

// --- Start Command ---
bot.start((ctx) => {
    let buttons = [
        [Markup.button.userRequest('👤 User', 1), Markup.button.botRequest('🤖 Bot', 2)],
        [Markup.button.groupRequest('📢 Group', 3), Markup.button.channelRequest('📺 Channel', 4)],
        ['🔍 Check by ID']
    ];
    if (ctx.from.id === ADMIN_ID) buttons.push(['⚙️ Admin Panel']);

    ctx.reply("👋 Welcome to ID Bot!", Markup.keyboard(buttons).resize());
});

// --- Admin Panel ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const stats = `📊 **Bot Status**\n\n` +
                  `👥 Total Users: ${db.users.length}\n` +
                  `⏳ Uptime: ${getUptime()}\n` +
                  `🖥 Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB Free`;

    ctx.replyWithMarkdown(stats, Markup.inlineKeyboard([
        [Markup.button.callback('📢 Start Broadcast', 'start_broadcast')],
        [Markup.button.callback('🔄 Refresh Stats', 'refresh_stats')]
    ]));
});

// --- Broadcast Logic ---
bot.action('start_broadcast', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("📝 Send the message (text) you want to broadcast to everyone:");
    bot.context.isBroadcasting = true;
});

bot.on('text', async (ctx, next) => {
    if (ctx.from.id !== ADMIN_ID || !bot.context.isBroadcasting) return next();
    
    bot.context.isBroadcasting = false; // Reset
    const text = ctx.message.text;
    const users = db.users;
    let success = 0;
    let failed = 0;

    const statusMsg = await ctx.reply(`🚀 Broadcasting to ${users.length} users... (0%)`);

    for (let i = 0; i < users.length; i++) {
        try {
            await bot.telegram.sendMessage(users[i], text);
            success++;
        } catch (e) {
            failed++;
        }
        
        // Update status every 5 users to avoid Telegram limits
        if (i % 5 === 0) {
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, 
                `🚀 Broadcasting: ${Math.round((i/users.length)*100)}%\n✅ Success: ${success}\n❌ Failed: ${failed}`);
        }
    }

    ctx.reply(`✅ **Broadcast Complete**\n\nTotal: ${users.length}\nSent: ${success}\nFailed: ${failed}`);
});

// --- Refresh Action ---
bot.action('refresh_stats', (ctx) => {
    ctx.answerCbQuery("Stats Updated!");
    // Trigger the hears logic again
    const stats = `📊 **Bot Status**\n\n` +
                  `👥 Total Users: ${db.users.length}\n` +
                  `⏳ Uptime: ${getUptime()}\n` +
                  `🖥 Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB Free`;
    ctx.editMessageText(stats, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('📢 Start Broadcast', 'start_broadcast')],
        [Markup.button.callback('🔄 Refresh Stats', 'refresh_stats')]
    ])});
});

// Default ID Lookups
bot.hears('🔍 Check by ID', (ctx) => ctx.reply("🔢 Send me the ID number:"));
bot.on('message', async (ctx) => {
    if (ctx.message.text && /^-?\d+$/.test(ctx.message.text)) {
        try {
            const chat = await bot.telegram.getChat(ctx.message.text);
            return ctx.reply(`✅ Found: ${chat.first_name} (@${chat.username || 'No User'})`);
        } catch (e) { return ctx.reply("❌ ID not found."); }
    }
    if (ctx.message.chat_shared) return ctx.reply(`ID: ${ctx.message.chat_shared.chat_id}`);
    ctx.reply(`Your Id: ${ctx.from.id}`);
});

bot.launch().then(() => console.log("🚀 Bot is live with Admin Status Panel"));
