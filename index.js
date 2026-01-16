require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './database.json';
const DOWNLOADS_DIR = './downloads';

// Ensure directories exist
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }));
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);

const db = JSON.parse(fs.readFileSync(DB_FILE));

function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

bot.use(async (ctx, next) => {
    try {
        if (ctx.from) saveUser(ctx.from.id);
        await next();
    } catch (err) { console.error("Bot Error:", err.message); }
});

// --- Helper: Conversion Logic ---
async function convertVideoToAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('mp3')
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .save(outputPath);
    });
}

// --- Welcome Message ---
bot.start((ctx) => {
    ctx.reply(
        `🎬 <b>Video to Audio Converter</b>\n\n` +
        `Send me any <b>Video</b> and I will extract the audio for you as an MP3 file.\n\n` +
        `Your ID: <code>${ctx.from.id}</code>`,
        { 
            parse_mode: 'HTML',
            ...Markup.keyboard([
                ['👤 My ID', '🔍 Check by ID'],
                (ctx.from.id === ADMIN_ID ? ['⚙️ Admin Panel'] : [])
            ]).resize()
        }
    ).catch(() => {});
});

// --- Video Processing ---
bot.on(['video', 'document'], async (ctx) => {
    const file = ctx.message.video || (ctx.message.document && ctx.message.document.mime_type.includes('video') ? ctx.message.document : null);
    
    if (!file) return;

    const statusMsg = await ctx.reply("⏳ <i>Downloading video...</i>", { parse_mode: 'HTML' });

    try {
        const fileLink = await ctx.telegram.getFileLink(file.file_id);
        const inputPath = path.join(DOWNLOADS_DIR, `${file.file_id}.mp4`);
        const outputPath = path.join(DOWNLOADS_DIR, `${file.file_id}.mp3`);

        // Download file
        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(inputPath, Buffer.from(buffer));

        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, "⚙️ <i>Converting to MP3...</i>", { parse_mode: 'HTML' });

        // Convert
        await convertVideoToAudio(inputPath, outputPath);

        // Send Audio
        await ctx.replyWithAudio({ source: outputPath }, { caption: "✅ Audio extracted successfully!" });

        // Cleanup
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});

    } catch (error) {
        console.error(error);
        ctx.reply("❌ Error processing video. Ensure it is not too large (Max 20MB for bots).");
    }
});

// --- Admin Panel ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const adminMsg = `🛠 <b>Admin Dashboard</b>\n\n📊 Total Users: <code>${db.users.length}</code>`;
    ctx.reply(adminMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Broadcast', 'start_broadcast'), Markup.button.callback('📊 Export DB', 'export_db')]
        ])
    });
});

bot.action('start_broadcast', (ctx) => {
    bot.context.isBroadcasting = true;
    ctx.reply("📸 Send message to broadcast:").catch(() => {});
});

bot.on('message', async (ctx, next) => {
    if (ctx.from.id === ADMIN_ID && bot.context.isBroadcasting) {
        bot.context.isBroadcasting = false;
        for (let userId of db.users) {
            try { await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id); } catch (e) {}
        }
        return ctx.reply("✅ Broadcast Complete!");
    }
    
    if (ctx.message.text === '👤 My ID') {
        return ctx.reply(`Your ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
    }
    return next();
});

bot.launch();
