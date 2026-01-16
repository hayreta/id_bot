require("dotenv").config();
const { Telegraf } = require("telegraf");

// Initialize bot with your token from the .env file
const bot = new Telegraf(process.env.BOT_TOKEN);

// Command: /start
bot.start((ctx) => {
  ctx.reply(
    "Hello! I am your bot running on Railway. How can I help you today?"
  );
});

// Command: /ping
bot.command("ping", (ctx) => ctx.reply("Pong! 🏓"));

// Echo: Responds to any text message
bot.on("text", (ctx) => {
  ctx.reply(`You said: ${ctx.message.text}`);
});

// Launch bot
bot.launch();
console.log("Bot is online and listening...");

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
