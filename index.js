require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';

// --- Database Logic ---
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], startTime: Date.now() }));
}
let db = JSON.parse(fs.readFileSync(DB_FILE));

/**
 * Saves user to DB and notifies Admin if it's a new user
 */
async function saveUser(ctx) {
    if (!ctx.from) return;
    
    const id = ctx.from.id;
    const username = ctx.from.username ? `@${ctx.from.username}` : "No Username";
    const name = ctx.from.first_name || "Unknown";

    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));

        // --- NEW USER NOTIFICATION FOR ADMIN ---
        const notifyMsg = 
            `🆕 <b>New User Notification</b>\n\n` +
            `👤 <b>Name:</b> ${name}\n` +
            `🆔 <b>ID:</b> <code>${id}</code>\n` +
            `🔗 <b>User:</b> ${username}`;

        try {
            await bot.telegram.sendMessage(ADMIN_ID, notifyMsg, { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Failed to notify admin:", e.message);
        }
    }
}

// Track user activity via Middleware
bot.use(async (ctx, next) => {
    try {
        await saveUser(ctx);
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

    ctx.reply(welcomeMsg, { 
        parse_mode: 'HTML', 
        ...Markup.keyboard(buttons).resize() 
    }).catch(e => console.log(e.message));
});

// --- Admin Panel ---
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

// --- ID Lookup Handlers (Shared Buttons) ---
bot.on('chat_shared', (ctx) => {
    const chatId = ctx.message.chat_shared.chat_id;
    ctx.reply(`✅ <b>Chat ID:</b> <code>${chatId}</code>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('📋 Copy ID', 'copy_hint')]])
    }).catch(() => {});
});

bot.on('user_shared', (ctx) => {
    const userId = ctx.message.user_shared.user_id;
    ctx.reply(`✅ <b>User ID:</b> <code>${userId}</code>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('📋 Copy ID', 'copy_hint')]])
    }).catch(() => {});
});

bot.action('copy_hint', (ctx) => {
    ctx.answerCbQuery("Tap the ID number above to copy it!", { show_alert: false });
});

bot.hears('🔍 Check by ID', (ctx) => ctx.reply("Send an ID to check its details:").catch(() => {}));

// --- Main Message Handler ---
bot.on('message', async (ctx) => {
    // Admin Broadcast Logic
    if (ctx.from.id === ADMIN_ID && bot.context.isBroadcasting) {
        bot.context.isBroadcasting = false; 
        let count = 0;
        ctx.reply("🚀 Sending broadcast...").catch(() => {});
        
        for (let userId of db.users) {
            try { 
                await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id); 
                count++;
                await new Promise(resolve => setTimeout(resolve, 50)); 
            } catch (e) {
                // User blocked bot
            }
        }
        return ctx.reply(`✅ Sent to ${count} users.`).catch(() => {});
    }

    const msg = ctx.message;

    // Check if user sent a raw ID number
    if (msg.text && /^-?\d+$/.test(msg.text)) {
        try {
            const chat = await bot.telegram.getChat(msg.text);
            return ctx.reply(`✅ <b>Details Found:</b>\n\n<b>ID:</b> <code>${chat.id}</code>\n<b>Name:</b> ${chat.first_name || chat.title}`, { parse_mode: 'HTML' });
        } catch (e) { 
            return ctx.reply("❌ Chat/User not found or bot has no access.").catch(() => {}); 
        }
    }

    // Forwarded Messages
    if (msg.forward_from_chat) return ctx.reply(`✅ <b>Forwarded Chat ID:</b> <code>${msg.forward_from_chat.id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    if (msg.forward_from) return ctx.reply(`✅ <b>Forwarded User ID:</b> <code>${msg.forward_from.id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    
    // Shared Contacts
    if (msg.contact) return ctx.reply(`✅ <b>Contact User ID:</b> <code>${msg.contact.user_id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    
    // Default reply (User's own ID)
    ctx.reply(`Your Id: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
});

bot.launch().then(() => console.log("Bot started successfully."));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
