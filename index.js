require('dotenv').config(); // Loads variables from .env into process.env
const { Telegraf } = require('telegraf');

// It will first look for BOT_TOKEN in your .env file or Railway settings
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
    ctx.replyWithMarkdownV2(
        "👋 *Welcome to ID Bot\\!*\n\n" +
        "• Send a message for your *User ID*\n" +
        "• Add me to a *Group* for the Group ID\n" +
        "• Forward from a *Channel/Bot* for their ID"
    );
});

bot.on('message', async (ctx) => {
    const msg = ctx.message;
    let text = "📋 *Information Found:*\n\n";

    try {
        if (msg.forward_from_chat) {
            text += `📢 *Channel ID:* \`${msg.forward_from_chat.id}\`\n`;
            text += `🏷 *Title:* ${msg.forward_from_chat.title}\n`;
        } 
        else if (msg.forward_from) {
            const type = msg.forward_from.is_bot ? "🤖 *Bot ID:*" : "👤 *User ID:*";
            text += `${type} \`${msg.forward_from.id}\`\n`;
            text += `🏷 *Name:* ${msg.forward_from.first_name}\n`;
        } 
        else {
            const chatType = msg.chat.type;
            if (chatType === 'private') {
                text += `👤 *Your User ID:* \`${msg.from.id}\`\n`;
                text += `🏷 *Name:* ${msg.from.first_name}\n`;
            } 
            else if (chatType === 'group' || chatType === 'supergroup') {
                text += `👥 *Group ID:* \`${msg.chat.id}\`\n`;
                text += `🏷 *Group Title:* ${msg.chat.title}\n`;
            }
        }

        const escapedText = text.replace(/-/g, "\\-").replace(/\./g, "\\.").replace(/!/g, "\\!");
        await ctx.replyWithMarkdownV2(escapedText);

    } catch (e) {
        console.error(e);
    }
});

bot.launch().then(() => console.log("🚀 Bot is running..."));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
