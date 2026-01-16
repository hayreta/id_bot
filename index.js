require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const https = require('https');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

// Set FFmpeg path globally
ffmpeg.setFfmpegPath(ffmpegPath);

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';
const DOWNLOADS_DIR = './downloads';

// --- System Initialization ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }));
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);

let db = JSON.parse(fs.readFileSync(DB_FILE));

// Database Save Helper
function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

// --- Middlewares ---
bot.use(async (ctx, next) => {
    if (ctx.from) saveUser(ctx.from.id);
    return next();
});

// Catch-all Error Handler to prevent crashes
bot.catch((err) => {
    console.error('CRITICAL BOT ERROR:', err.message);
});

// --- Helper Functions ---
function getUptime() {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    return `${h}h ${m}m ${s}s`;
}

const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => { fs.unlink(dest, () => reject(err)); });
    });
};

// --- Bot Commands ---
bot.start((ctx) => {
    const welcome = 
        `🎬 <b>Video to Audio Converter</b>\n\n` +
        `Send me a video file, and I will extract the audio in MP3 format.\n\n` +
        `👤 Your ID: <code>${ctx.from.id}</code>`;

    ctx.reply(welcome, {
        parse_mode: 'HTML',
        ...Markup.keyboard([
            ['👤 My ID', '🔍 Check by ID'],
            (ctx.from.id === ADMIN_ID ? ['⚙️ Admin Panel'] : [])
        ]).resize()
    }).catch(() => {});
});

// --- Video Processing Logic ---
bot.on(['video', 'document'], async (ctx) => {
    const msg = ctx.message;
    const file = msg.video || (msg.document && msg.document.mime_type.startsWith('video/') ? msg.document : null);

    if (!file) return;

    const waitMsg = await ctx.reply("📥 <b>Downloading...</b>", { parse_mode: 'HTML' });

    try {
        const fileLink = await ctx.telegram.getFileLink(file.file_id);
        const iPath = path.join(DOWNLOADS_DIR, `${file.file_id}.mp4`);
        const oPath = path.join(DOWNLOADS_DIR, `${file.file_id}.mp3`);

        await downloadFile(fileLink.href, iPath);

        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "⚙️ <b>Converting...</b>", { parse_mode: 'HTML' });

        ffmpeg(iPath)
            .toFormat('mp3')
            .on('error', (err) => { throw err; })
            .on('end', async () => {
                await ctx.replyWithAudio({ source: oPath }, { caption: "✅ Audio extracted." });
                if (fs.existsSync(iPath)) fs.unlinkSync(iPath);
                if (fs.existsSync(oPath)) fs.unlinkSync(oPath);
                ctx.deleteMessage(waitMsg.message_id).catch(() => {});
            })
            .save(oPath);

    } catch (e) {
        ctx.reply("❌ Error processing your video.").catch(() => {});
    }
});

// --- Advanced Admin Panel ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const stats = 
        `📊 <b>System Statistics</b>\n` +
        `├ Total Users: <code>${db.users.length}</code>\n` +
        `├ RAM: <code>${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</code>\n` +
        `└ Uptime: <code>${getUptime()}</code>`;

    ctx.reply(stats, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Start Broadcast', 'start_bc')],
            [Markup.button.callback('📊 Export Database', 'export_db'), Markup.button.callback('🔄 Refresh', 'refresh_stats')]
        ])
    });
});

bot.action('refresh_stats', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const stats = `📊 <b>System Statistics</b>\n├ Total Users: <code>${db.users.length}</code>\n├ RAM: <code>${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</code>\n└ Uptime: <code>${getUptime()}</code>`;
    ctx.editMessageText(stats, { parse_mode: 'HTML', ...ctx.callbackQuery.message.reply_markup }).catch(() => ctx.answerCbQuery());
});

bot.action('start_bc', (ctx) => {
    bot.context.bcActive = true;
    ctx.reply("✍️ <b>Send me the message for broadcast:</b>", { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

bot.action('export_db', (ctx) => {
    ctx.replyWithDocument({ source: DB_FILE }).catch(() => {});
    ctx.answerCbQuery();
});

// --- Universal Message Handler ---
bot.on('message', async (ctx, next) => {
    // Broadcast Logic
    if (ctx.from.id === ADMIN_ID && bot.context.bcActive) {
        bot.context.bcActive = false;
        let sent = 0;
        const progress = await ctx.reply("🚀 <b>Broadcasting...</b>", { parse_mode: 'HTML' });

        for (const uid of db.users) {
            try {
                await ctx.telegram.copyMessage(uid, ctx.chat.id, ctx.message.message_id);
                sent++;
            } catch (e) {}
        }
        return ctx.reply(`✅ <b>Broadcast Finished</b>\nSent to <code>${sent}</code> users.`, { parse_mode: 'HTML' });
    }

    if (ctx.message.text === '👤 My ID') return ctx.reply(`Your ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
    if (ctx.message.text === '🔍 Check by ID') return ctx.reply("Please send me any message or forward one to get the ID.");

    // Handle Manual ID Check
    if (ctx.message.text && /^-?\d+$/.test(ctx.message.text)) {
        try {
            const info = await bot.telegram.getChat(ctx.message.text);
            return ctx.reply(`<b>Chat Found:</b>\nID: <code>${info.id}</code>\nTitle: ${info.title || info.first_name}`, { parse_mode: 'HTML' });
        } catch (e) { return ctx.reply("❌ Chat not found."); }
    }

    return next();
});

bot.launch().then(() => console.log('Bot is running safely...'));
