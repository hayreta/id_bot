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
const DOWNLOADS_DIR = './downloads';

// --- Initialization ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }));
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);

let db = JSON.parse(fs.readFileSync(DB_FILE));

function saveUser(id) {
    if (!db.users.includes(id)) {
        db.users.push(id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
}

// Global error handler to prevent process exit
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err);
});

bot.use(async (ctx, next) => {
    if (ctx.from) saveUser(ctx.from.id);
    return next();
});

// --- Helper: Stable Downloader ---
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
};

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
    ctx.reply(
        `🎬 <b>Video to Audio Converter</b>\n\n` +
        `Send me a video or forward one from a channel, and I'll send you the MP3.\n\n` +
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
    const isDoc = !!ctx.message.document;
    const file = isDoc ? ctx.message.document : ctx.message.video;

    // Filter for video types only
    if (isDoc && !file.mime_type.startsWith('video/')) return;

    const statusMsg = await ctx.reply("⏳ <b>Processing...</b>\nDownloading from Telegram servers...", { parse_mode: 'HTML' });

    try {
        const fileId = file.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const inputPath = path.join(DOWNLOADS_DIR, `${fileId}.mp4`);
        const outputPath = path.join(DOWNLOADS_DIR, `${fileId}.mp3`);

        // Download
        await downloadFile(fileLink.href, inputPath);
        
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, "⚙️ <b>Converting...</b>\nExtracting audio stream...", { parse_mode: 'HTML' });

        // Convert
        ffmpeg(inputPath)
            .toFormat('mp3')
            .on('error', async (err) => {
                throw err;
            })
            .on('end', async () => {
                await ctx.replyWithAudio({ source: outputPath }, { caption: "✅ Audio Extracted" });
                // Cleanup
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
            })
            .save(outputPath);

    } catch (error) {
        console.error("Conversion Error:", error);
        ctx.reply("❌ <b>Failed!</b>\nMake sure the file is under 20MB and is a valid video format.", { parse_mode: 'HTML' });
    }
});

// --- Admin Dashboard ---
bot.hears('⚙️ Admin Panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const usedMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    ctx.reply(
        `🛠 <b>Admin Dashboard</b>\n\n` +
        `📊 Users: <code>${db.users.length}</code>\n` +
        `🖥 RAM: <code>${usedMem} MB</code>\n` +
        `🕒 Uptime: <code>${getUptime()}</code>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📢 Broadcast', 'start_broadcast'), Markup.button.callback('📊 Export DB', 'export_db')],
                [Markup.button.callback('🔄 Refresh', 'refresh_admin')]
            ])
        }
    );
});

bot.action('start_broadcast', (ctx) => {
    bot.context.isBroadcasting = true;
    ctx.reply("📝 <b>Ready</b>\nSend the message you want to broadcast:", { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

// --- Final Message Handler ---
bot.on('message', async (ctx, next) => {
    if (ctx.from.id === ADMIN_ID && bot.context.isBroadcasting) {
        bot.context.isBroadcasting = false;
        let success = 0;
        for (let userId of db.users) {
            try { 
                await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id); 
                success++;
            } catch (e) {}
        }
        return ctx.reply(`✅ Broadcast sent to ${success} users.`);
    }

    if (ctx.message.text === '👤 My ID') {
        return ctx.reply(`Your ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
    }
    
    if (ctx.message.text === '🔍 Check by ID') {
        return ctx.reply("Send me an ID to look up:");
    }

    return next();
});

bot.launch().then(() => console.log("Converter Bot Online"));
