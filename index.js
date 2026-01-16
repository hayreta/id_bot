require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Start Command with updated 3-row keyboard
bot.start((ctx) => {
    const welcomeMsg = 
        "👋 Welcome to ID Bot!\n\n" +
        "🔹 Use the buttons below or send/forward a message to get IDs.\n" +
        "🔍 To check a user, click '🔍 Check ID' then send me the ID number.";

    return ctx.reply(welcomeMsg, Markup.keyboard([
        [Markup.button.userRequest('👤 User', 1), Markup.button.botRequest('🤖 Bot', 2)],
        [Markup.button.groupRequest('📢 Group', 3), Markup.button.channelRequest('📺 Channel', 4)],
        ['🔍 Check by ID'] // New button
    ]).resize());
});

// 2. Handle the "Check by ID" button click
bot.hears('🔍 Check by ID', (ctx) => {
    ctx.reply("🔢 Please send me the **Telegram ID** you want to check:");
});

// 3. Main Message & ID Lookup Handler
bot.on('message', async (ctx) => {
    const msg = ctx.message;

    // Check if the user sent a numeric ID (e.g., "5522724001")
    if (msg.text && /^-?\d+$/.test(msg.text)) {
        const searchId = msg.text;
        try {
            // Retrieve extended chat/user info
            const chat = await bot.telegram.getChat(searchId);
            
            let response = "✅ **User Information Found:**\n\n";
            response += `🆔 **ID:** \`${chat.id}\`\n`;
            response += `👤 **Name:** ${chat.first_name || ''} ${chat.last_name || ''}\n`;
            response += `🏷 **Username:** ${chat.username ? '@' + chat.username : 'None'}\n`;
            response += `📝 **Bio:** ${chat.bio || 'No bio available'}\n`;

            return ctx.replyWithMarkdown(response);
        } catch (error) {
            return ctx.reply("❌ **Error:** I cannot find this ID. The user must message me first or we must share a group.");
        }
    }

    // --- Standard ID Handlers (From previous version) ---
    if (msg.chat_shared) return ctx.reply(`Target ID: ${msg.chat_shared.chat_id}`);
    if (msg.user_shared) return ctx.reply(`Target ID: ${msg.user_shared.user_id}`);
    
    // Default reply for your own ID
    if (!msg.forward_from && !msg.forward_from_chat) {
        return ctx.reply(`Your Id: ${msg.from.id}`);
    }
});

bot.launch().then(() => console.log("🚀 ID Bot with Lookup is running!"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
