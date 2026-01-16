require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';

// --- Database Logic ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }));
const db = JSON.parse(fs.readFileSync(DB_FILE));

function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

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
        `📌 Simply send or share, and I'll provide the ID you need\\!\n\n` +
        `Your Id: \`${ctx.from.id}\``; // Clickable ID

    let buttons = [
        [Markup.button.userRequest('👤 User', 1), Markup.button.botRequest('🤖 Bot', 2)],
        [Markup.button.groupRequest('📢 Group', 3), Markup.button.channelRequest('📺 Channel', 4)],
        ['🔍 Check by ID']
    ];
    if (ctx.from.id === ADMIN_ID) buttons.push(['⚙️ Admin Panel']);

    ctx.replyWithMarkdownV2(welcomeMsg, Markup.keyboard(buttons).resize());
});

// --- Admin & Broadcast ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(`📊 Users: ${db.users.length}`, Markup.inlineKeyboard([
        [Markup.button.callback('📢 Start Broadcast', 'start_broadcast')]
    ]));
});

bot.action('start_broadcast', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("📸 Send any message (Text, Image, or Forward) to broadcast:");
    bot.context.isBroadcasting = true;
});

// --- Main Message Handler ---
bot.on('message', async (ctx) => {
    const msg = ctx.message;

    // Handle Broadcast
    if (ctx.from.id === ADMIN_ID && bot.context.isBroadcasting) {
        bot.context.isBroadcasting = false;
        let success = 0;
        for (let userId of db.users) {
            try {
                await ctx.telegram.copyMessage(userId, ctx.chat.id, msg.message_id);
                success++;
            } catch (e) {}
        }
        return ctx.reply(`✅ Broadcast Complete! Sent to ${success} users.`);
    }

    // Helper for clickable ID replies
    const replyID = (label, id) => ctx.replyWithMarkdownV2(`${label}: \`${id}\``);

    // Shared Chats
    if (msg.chat_shared) return replyID('Target ID', msg.chat_shared.chat_id);
    if (msg.user_shared) return replyID('Target ID', msg.user_shared.user_id);
    
    // Forwards & Contacts
    if (msg.forward_from_chat) return replyID('Forwarded Chat ID', msg.forward_from_chat.id);
    if (msg.forward_from) return replyID('Forwarded User ID', msg.forward_from.id);
    if (msg.contact) return replyID('Contact ID', msg.contact.user_id);
    
    // Manual ID Search
    if (msg.text && /^-?\d+$/.test(msg.text)) {
        try {
            const chat = await bot.telegram.getChat(msg.text);
            const title = chat.first_name || chat.title || 'Unknown';
            return ctx.replyWithMarkdownV2(`🆔 ID: \`${chat.id}\`\n👤 Name: ${title}`);
        } catch (e) { return ctx.reply("❌ Not found."); }
    }

    if (msg.text === '🔍 Check by ID') return ctx.reply("Send the numeric ID:");
    
    // Default reply
    replyID('Your Id', ctx.from.id);
});

bot.launch();
