require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const https = require('https');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';
const TEMP_DIR = './downloads';

// --- Startup Check ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }));
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

let db = JSON.parse(fs.readFileSync(DB_FILE));

function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

// CRITICAL: Prevent crash on any unhandled error
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err.message);
});

bot.use(async (ctx, next) => {
    if (ctx.from) saveUser(ctx.from.id);
    return next();
});

// --- Stable Download Stream ---
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode !== 200) reject(new Error('Download Failed'));
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => { 
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(err); 
        });
    });
};

// --- Bot Start ---
bot.start((ctx) => {
    let menu = (ctx.from.id === ADMIN_ID) ? Markup.keyboard([['⚙️ Admin Panel']]).resize() : { remove_keyboard: true };
    ctx.reply(
        `🎬 <b>Video to Audio Converter</b>\n\n` +
        `Send me any video (Max 20MB) and I will extract the MP3 for you.\n\n` +
        `Your ID: <code>${ctx.from.id}</code>`,
        { parse_mode: 'HTML', ...menu }
    ).catch(() => {});
});

// --- Core Conversion Logic ---
bot.on(['video', 'document'], async (ctx) => {
    const msg = ctx.message;
    const file = msg.video || (msg.document && msg.document.mime_type.startsWith('video/') ? msg.document : null);

    if (!file) return;

    // 🛑 Size Check (Telegram Bot API limit is 20MB)
    if (file.file_size > 20 * 1024 * 1024) {
        return ctx.reply("❌ <b>File too large!</b>\nTelegram only allows bots to download files under 20MB.", { parse_mode: 'HTML' });
    }

    const status = await ctx.reply("⏳ <b>Downloading...</b>", { parse_mode: 'HTML' });

    try {
        const link = await ctx.telegram.getFileLink(file.file_id);
        const iPath = path.join(TEMP_DIR, `in_${file.file_id}.mp4`);
        const oPath = path.join(TEMP_DIR, `out_${file.file_id}.mp3`);

        await downloadFile(link.href, iPath);
        await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, null, "⚙️ <b>Converting...</b>", { parse_mode: 'HTML' });

        ffmpeg(iPath)
            .toFormat('mp3')
            .on('error', (err) => { throw err; })
            .on('end', async () => {
                await ctx.replyWithAudio({ source: oPath }, { caption: "✅ <b>Audio Extracted</b>", parse_mode: 'HTML' });
                // Clean up
                if (fs.existsSync(iPath)) fs.unlinkSync(iPath);
                if (fs.existsSync(oPath)) fs.unlinkSync(oPath);
                ctx.deleteMessage(status.message_id).catch(() => {});
            })
            .save(oPath);

    } catch (e) {
        console.error("Task Error:", e.message);
        ctx.reply("❌ <b>Conversion Failed</b>\nPlease try a different video format.", { parse_mode: 'HTML' });
    }
});

// --- Admin Features ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(`📊 <b>Admin Dashboard</b>\n\nTotal Users: <code>${db.users.length}</code>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Broadcast', 'start_bc'), Markup.button.callback('📊 Export DB', 'export_db')]
        ])
    });
});

bot.action('start_bc', (ctx) => {
    bot.context.bcActive = true;
    ctx.reply("✍️ <b>Send the message to broadcast:</b>", { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

bot.action('export_db', (ctx) => {
    ctx.replyWithDocument({ source: DB_FILE }).catch(() => {});
    ctx.answerCbQuery();
});

bot.on('message', async (ctx) => {
    if (ctx.from.id === ADMIN_ID && bot.context.bcActive) {
        bot.context.bcActive = false;
        let count = 0;
        ctx.reply("🚀 <b>Broadcasting...</b>", { parse_mode: 'HTML' });

        for (const uid of db.users) {
            try {
                await ctx.telegram.copyMessage(uid, ctx.chat.id, ctx.message.message_id);
                count++;
            } catch (e) {}
        }
        return ctx.reply(`✅ Sent to <code>${count}</code> users.`, { parse_mode: 'HTML' });
    }
});

bot.launch().then(() => console.log("Converter Bot Online and Protected."));
