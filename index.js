require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const https = require('https');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

// Initialize FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';
const TEMP_DIR = './downloads';

// --- Setup ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }));
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

let db = JSON.parse(fs.readFileSync(DB_FILE));

function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

// Global Safety Net
bot.catch((err) => {
    console.error('Bot Error ignored to prevent crash:', err.message);
});

bot.use(async (ctx, next) => {
    if (ctx.from) saveUser(ctx.from.id);
    return next();
});

// --- Downloader ---
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => { 
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(err); 
        });
    });
};

// --- Welcome ---
bot.start((ctx) => {
    let buttons = [];
    if (ctx.from.id === ADMIN_ID) buttons.push(['⚙️ Admin Panel']);

    ctx.reply(
        `🎬 <b>Video to Audio Converter</b>\n\n` +
        `Send me any video, and I will extract the audio for you.\n\n` +
        `Your ID: <code>${ctx.from.id}</code>`,
        { 
            parse_mode: 'HTML', 
            ...Markup.keyboard(buttons).resize() 
        }
    ).catch(() => {});
});

// --- Core Logic: Video to MP3 ---
bot.on(['video', 'document'], async (ctx) => {
    const msg = ctx.message;
    const file = msg.video || (msg.document && msg.document.mime_type.startsWith('video/') ? msg.document : null);

    if (!file) return;

    const status = await ctx.reply("⏳ <b>Downloading...</b>", { parse_mode: 'HTML' });

    try {
        const link = await ctx.telegram.getFileLink(file.file_id);
        const iPath = path.join(TEMP_DIR, `v_${file.file_id}.mp4`);
        const oPath = path.join(TEMP_DIR, `a_${file.file_id}.mp3`);

        await downloadFile(link.href, iPath);
        await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, null, "⚙️ <b>Converting...</b>", { parse_mode: 'HTML' });

        ffmpeg(iPath)
            .toFormat('mp3')
            .on('error', (err) => { throw err; })
            .on('end', async () => {
                await ctx.replyWithAudio({ source: oPath }, { caption: "✅ Audio Extracted" });
                // Cleanup files
                if (fs.existsSync(iPath)) fs.unlinkSync(iPath);
                if (fs.existsSync(oPath)) fs.unlinkSync(oPath);
                ctx.deleteMessage(status.message_id).catch(() => {});
            })
            .save(oPath);

    } catch (e) {
        ctx.reply("❌ <b>Error:</b> File too large or invalid.").catch(() => {});
    }
});

// --- Advanced Admin Panel ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const stats = 
        `📊 <b>Admin Dashboard</b>\n` +
        `├ Total Users: <code>${db.users.length}</code>\n` +
        `├ RAM: <code>${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</code>\n` +
        `└ Uptime: <code>${Math.floor(process.uptime() / 60)}m</code>`;

    ctx.reply(stats, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Broadcast', 'start_bc')],
            [Markup.button.callback('📊 Export DB', 'export_db'), Markup.button.callback('🔄 Refresh', 'ref_stats')]
        ])
    });
});

bot.action('ref_stats', (ctx) => {
    const stats = `📊 <b>Admin Dashboard</b>\n├ Total Users: <code>${db.users.length}</code>\n├ RAM: <code>${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</code>\n└ Uptime: <code>${Math.floor(process.uptime() / 60)}m</code>`;
    ctx.editMessageText(stats, { parse_mode: 'HTML', ...ctx.callbackQuery.message.reply_markup }).catch(() => ctx.answerCbQuery());
});

bot.action('start_bc', (ctx) => {
    bot.context.bcActive = true;
    ctx.reply("✍️ <b>Send message for broadcast:</b>", { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

bot.action('export_db', (ctx) => {
    ctx.replyWithDocument({ source: DB_FILE }).catch(() => {});
    ctx.answerCbQuery();
});

// --- Handler ---
bot.on('message', async (ctx) => {
    if (ctx.from.id === ADMIN_ID && bot.context.bcActive) {
        bot.context.bcActive = false;
        let count = 0;
        ctx.reply("🚀 <b>Sending...</b>", { parse_mode: 'HTML' });

        for (const uid of db.users) {
            try {
                await ctx.telegram.copyMessage(uid, ctx.chat.id, ctx.message.message_id);
                count++;
            } catch (e) {}
        }
        return ctx.reply(`✅ Sent to <code>${count}</code> users.`, { parse_mode: 'HTML' });
    }
});

bot.launch().then(() => console.log("Converter Bot Online"));
