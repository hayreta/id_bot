require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';

// --- Database Logic ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], startTime: Date.now() }));
let db = JSON.parse(fs.readFileSync(DB_FILE));

function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

// Track user activity - FIXED with global catch
bot.use(async (ctx, next) => {
    try {
        if (ctx.from) saveUser(ctx.from.id);
        await next();
    } catch (err) {
        console.error("Caught error:", err.message);
    }
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
        `✅ Share a contact\n\n` +
        `Your Id: <code>${ctx.from.id}</code>`;

    let buttons = [
        [Markup.button.userRequest('👤 User', 1), Markup.button.botRequest('🤖 Bot', 2)],
        [Markup.button.groupRequest('📢 Group', 3), Markup.button.channelRequest('📺 Channel', 4)],
        ['🔍 Check by ID']
    ];
    if (ctx.from.id === ADMIN_ID) buttons.push(['⚙️ Admin Panel']);

    ctx.reply(welcomeMsg, { parse_mode: 'HTML', ...Markup.keyboard(buttons).resize() }).catch(e => console.log(e.message));
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

    ctx.reply(adminMsg, { parse_mode: 'HTML', ...adminButtons }).catch(e => console.log(e.message));
});

// --- Admin Actions ---
bot.action('refresh_admin', async (ctx) => {
    const totalUsers = db.users.length;
    const usedMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const adminMsg = `🛠 <b>Advanced Admin Dashboard</b>\n\n📊 <b>User Statistics</b>\n├ Total Users: <code>${totalUsers}</code>\n└ Status: 🟢 Online\n\n🖥 <b>Server Status</b>\n├ Uptime: <code>${getUptime()}</code>\n└ RAM Usage: <code>${usedMem} MB</code>`;

    try {
        await ctx.editMessageText(adminMsg, { 
            parse_mode: 'HTML', 
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📢 Broadcast', 'start_broadcast'), Markup.button.callback('📊 Export DB', 'export_db')],
                [Markup.button.callback('🔄 Refresh Stats', 'refresh_admin'), Markup.button.callback('🗑 Clear DB', 'confirm_clear')]
            ])
        });
    } catch (e) { 
        ctx.answerCbQuery("Stats Updated!").catch(() => {}); 
    }
});

bot.action('start_broadcast', (ctx) => {
    bot.context.isBroadcasting = true;
    ctx.reply("📸 <b>Broadcast Mode Active</b>\nSend any message to broadcast.", { parse_mode: 'HTML' }).catch(() => {});
    ctx.answerCbQuery().catch(() => {});
});

bot.action('export_db', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.replyWithDocument({ source: DB_FILE, filename: 'database.json' }).catch(() => ctx.reply("Export failed."));
    ctx.answerCbQuery().catch(() => {});
});

bot.action('confirm_clear', (ctx) => {
    ctx.editMessageText("⚠️ <b>Wipe Database?</b>", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Yes, Clear', 'clear_database')],
            [Markup.button.callback('❌ Cancel', 'refresh_admin')]
        ])
    }).catch(() => {});
});

bot.action('clear_database', (ctx) => {
    db.users = [ADMIN_ID];
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    ctx.editMessageText("✅ Database Reset.").catch(() => {});
});

// --- ID Lookup Handlers ---
bot.hears('🔍 Check by ID', (ctx) => ctx.reply("Send ID:").catch(() => {}));
bot.on('chat_shared', (ctx) => ctx.reply(`ID: <code>${ctx.message.chat_shared.chat_id}</code>`, { parse_mode: 'HTML' }).catch(() => {}));
bot.on('user_shared', (ctx) => ctx.reply(`ID: <code>${ctx.message.user_shared.user_id}</code>`, { parse_mode: 'HTML' }).catch(() => {}));

// Final catch-all
bot.on('message', async (ctx) => {
    if (ctx.from.id === ADMIN_ID && bot.context.isBroadcasting) {
        bot.context.isBroadcasting = false; 
        let count = 0;
        ctx.reply("🚀 Sending broadcast...").catch(() => {});
        
        for (let userId of db.users) {
            try { 
                await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id); 
                count++;
            } catch (e) {
                // Skips users who blocked the bot without crashing the whole loop
            }
        }
        return ctx.reply(`✅ Sent to ${count} users.`).catch(() => {});
    }

    const msg = ctx.message;

    if (msg.text && /^-?\d+$/.test(msg.text)) {
        try {
            const chat = await bot.telegram.getChat(msg.text);
            return ctx.reply(`ID: <code>${chat.id}</code>\nName: ${chat.first_name || chat.title}`, { parse_mode: 'HTML' });
        } catch (e) { return ctx.reply("❌ Not found.").catch(() => {}); }
    }

    if (msg.forward_from_chat) return ctx.reply(`ID: <code>${msg.forward_from_chat.id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    if (msg.forward_from) return ctx.reply(`ID: <code>${msg.forward_from.id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    if (msg.contact) return ctx.reply(`ID: <code>${msg.contact.user_id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    
    ctx.reply(`Your Id: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
});

bot.launch().then(() => console.log("Bot started successfully."));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
