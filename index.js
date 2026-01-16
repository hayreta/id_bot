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

// --- Helper: Format Uptime ---
function getUptime() {
    const seconds = Math.floor(process.uptime());
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
}

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

// --- Admin Panel Main ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const totalUsers = db.users.length;
    const usedMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    
    const adminMsg = 
        `🛠 <b>Advanced Admin Dashboard</b>\n\n` +
        `📊 <b>User Statistics</b>\n` +
        `├ Total Users: <code>${totalUsers}</code>\n` +
        `└ Status: 🟢 Online\n\n` +
        `🖥 <b>Server Status</b>\n` +
        `├ Uptime: <code>${getUptime()}</code>\n` +
        `└ RAM Usage: <code>${usedMem} MB</code>`;

    const adminButtons = Markup.inlineKeyboard([
        [Markup.button.callback('📢 Broadcast', 'start_broadcast'), Markup.button.callback('📊 Export DB', 'export_db')],
        [Markup.button.callback('🔄 Refresh Stats', 'refresh_admin'), Markup.button.callback('🗑 Clear DB', 'confirm_clear')]
    ]);

    ctx.reply(adminMsg, { parse_mode: 'HTML', ...adminButtons });
});

// --- Admin Actions ---
bot.action('refresh_admin', (ctx) => {
    const totalUsers = db.users.length;
    const usedMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    
    const adminMsg = 
        `🛠 <b>Advanced Admin Dashboard</b>\n\n` +
        `📊 <b>User Statistics</b>\n` +
        `├ Total Users: <code>${totalUsers}</code>\n` +
        `└ Status: 🟢 Online\n\n` +
        `🖥 <b>Server Status</b>\n` +
        `├ Uptime: <code>${getUptime()}</code>\n` +
        `└ RAM Usage: <code>${usedMem} MB</code>`;

    ctx.editMessageText(adminMsg, { 
        parse_mode: 'HTML', 
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Broadcast', 'start_broadcast'), Markup.button.callback('📊 Export DB', 'export_db')],
            [Markup.button.callback('🔄 Refresh Stats', 'refresh_admin'), Markup.button.callback('🗑 Clear DB', 'confirm_clear')]
        ])
    }).catch(() => ctx.answerCbQuery("Updated!"));
});

bot.action('start_broadcast', (ctx) => {
    bot.context.isBroadcasting = true;
    ctx.reply("📸 <b>Broadcast Mode Active</b>\nSend me any message (text, photo, etc.) to send to all users.", { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

bot.action('export_db', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.replyWithDocument({ source: DB_FILE, filename: 'database.json' });
    ctx.answerCbQuery("Sent!");
});

bot.action('confirm_clear', (ctx) => {
    ctx.editMessageText("⚠️ <b>Wipe Database?</b>\nThis cannot be undone.", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Yes, Clear', 'clear_database')],
            [Markup.button.callback('❌ Cancel', 'refresh_admin')]
        ])
    });
});

bot.action('clear_database', (ctx) => {
    db.users = [ADMIN_ID];
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    ctx.editMessageText("✅ Database Reset.");
});

// --- ID Lookup Handlers ---
bot.hears('🔍 Check by ID', (ctx) => ctx.reply("Please send the ID you want to look up:"));
bot.on('chat_shared', (ctx) => ctx.reply(`ID: <code>${ctx.message.chat_shared.chat_id}</code>`, { parse_mode: 'HTML' }));
bot.on('user_shared', (ctx) => ctx.reply(`ID: <code>${ctx.message.user_shared.user_id}</code>`, { parse_mode: 'HTML' }));

// Final catch-all
bot.on('message', async (ctx) => {
    // Check if we are in broadcast mode
    if (ctx.from.id === ADMIN_ID && bot.context.isBroadcasting) {
        bot.context.isBroadcasting = false; 
        let count = 0;
        for (let userId of db.users) {
            try { 
                await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id); 
                count++;
            } catch (e) {}
        }
        return ctx.reply(`✅ Broadcast Complete! Sent to ${count} users.`);
    }
