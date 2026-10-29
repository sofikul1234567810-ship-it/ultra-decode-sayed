import { Bot, InputFile } from "grammy";
import { webcrack } from "webcrack";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const token = (process.env.BOT_TOKEN || "").trim();
const maxMB = Number(process.env.MAX_FILE_MB || 15);
const maxBytes = maxMB * 1024 * 1024;
if (!token) {
  console.error("BOT_TOKEN environment variable is required.");
  process.exit(1);
}
const bot = new Bot(token);

function deobfuscateJs(js) {
  return webcrack(js).then(result => result.code);
}

async function processHtml(source) {
  const notes = [];
  // Decode HTML entities in ordinary text, but do not globally rewrite the HTML.
  let output = source;
  const scriptRegex = /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi;
  let match;
  const matches = [];
  while ((match = scriptRegex.exec(source)) !== null) {
    matches.push({ start: match.index, end: scriptRegex.lastIndex, open: match[1], body: match[2], close: match[3] });
  }
  if (!matches.length) notes.push("No inline script blocks were found.");
  // Process from last to first so string offsets remain valid.
  for (const item of matches.reverse()) {
    const body = item.body.trim();
    if (!body || /^(https?:)?\/\//i.test(body)) continue;
    try {
      const decoded = await deobfuscateJs(body);
      if (decoded && decoded !== body) {
        output = output.slice(0, item.start) + item.open + "\n/* Static deobfuscation output; not executed by this bot */\n" + decoded + "\n" + item.close + output.slice(item.end);
        notes.push("An inline script was transformed by WebCrack.");
      } else {
        notes.push("An inline script was parsed, but no clear transformation was produced.");
      }
    } catch (e) {
      notes.push("A script block could not be deobfuscated: " + String(e?.message || e).slice(0, 180));
    }
  }
  return { output, notes };
}

bot.command("start", async ctx => {
  await ctx.reply(
    "FIACB Advanced Decoder Bot is online.\n\n" +
    "Send an .html, .htm, .js, .mjs, or .txt file. It will attempt WebCrack-based JavaScript deobfuscation and return a file with a useful extension.\n\n" +
    "Important: advanced/encrypted protection and integrity wrappers may not be fully recoverable. Uploaded code is analyzed, not executed."
  );
});
bot.command("help", async ctx => {
  await ctx.reply(`Supported files: .html .htm .js .mjs .txt\nMaximum size: ${maxMB} MB\nHTML input returns HTML; JS input returns JS. This is best-effort deobfuscation, not a guaranteed password/protection bypass.`);
});

bot.on("message:document", async ctx => {
  const doc = ctx.message.document;
  const originalName = path.basename(doc.file_name || "upload.txt");
  const ext = path.extname(originalName).toLowerCase();
  if (![".html", ".htm", ".js", ".mjs", ".txt"].includes(ext)) {
    await ctx.reply("Please send an .html, .htm, .js, .mjs, or .txt file.");
    return;
  }
  if (doc.file_size && doc.file_size > maxBytes) {
    await ctx.reply(`File is too large. Maximum size is ${maxMB} MB.`);
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fiacb-"));
  const inputPath = path.join(tmpDir, originalName);
  let outputPath, reportPath;
  try {
    const file = await ctx.getFile();
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!response.ok) throw new Error(`Telegram download failed (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("File exceeds configured size limit");
    await fs.writeFile(inputPath, buffer);
    const source = buffer.toString("utf8");
    let output = source;
    const notes = [];

    if (ext === ".html" || ext === ".htm") {
      const result = await processHtml(source);
      output = result.output;
      notes.push(...result.notes);
    } else if (ext === ".js" || ext === ".mjs") {
      try {
        output = await deobfuscateJs(source);
        notes.push(output !== source ? "WebCrack transformation applied." : "No clear transformation produced.");
      } catch (e) {
        notes.push("JavaScript deobfuscation failed: " + String(e?.message || e).slice(0, 180));
      }
    } else {
      // TXT may contain HTML or JavaScript; try to infer the content.
      if (/<html\b|<script\b/i.test(source)) {
        const result = await processHtml(source);
        output = result.output;
        notes.push(...result.notes);
      } else {
        try {
          output = await deobfuscateJs(source);
          notes.push(output !== source ? "WebCrack transformation applied." : "No clear transformation produced.");
        } catch (e) {
          notes.push("Text was preserved because it did not parse as supported JavaScript.");
        }
      }
    }

    const outExt = [".html", ".htm"].includes(ext) || (ext === ".txt" && /<html\b|<script\b/i.test(source))
      ? ".html" : ([".js", ".mjs"].includes(ext) ? ".js" : ".txt");
    const stem = path.basename(originalName, ext).slice(0, 70);
    outputPath = path.join(tmpDir, `${stem}_decoded${outExt}`);
    reportPath = path.join(tmpDir, `${stem}_report.txt`);
    await fs.writeFile(outputPath, output, "utf8");
    await fs.writeFile(reportPath,
      "FIACB Advanced Decoder Report\n" +
      `Input: ${originalName}\nInput size: ${buffer.length} bytes\nOutput size: ${Buffer.byteLength(output)} bytes\n\n` +
      notes.map((n, i) => `${i + 1}. ${n}`).join("\n") +
      "\n\nLimitations: WebCrack only supports certain common JavaScript obfuscation patterns. Encrypted payloads, custom runtime loaders, integrity checks, and access controls may remain intact. The bot does not execute the uploaded code.\n",
      "utf8");
    await ctx.reply("Analysis finished. The bot attempted JavaScript deobfuscation and is returning the resulting file plus a report. Some protection types may remain.");
    await ctx.replyWithDocument(new InputFile(outputPath), { caption: `Result: ${path.basename(outputPath)}` });
    await ctx.replyWithDocument(new InputFile(reportPath), { caption: "Deobfuscation report" });
  } catch (e) {
    console.error(e);
    await ctx.reply("Could not process this file. Check the file format and size, then try again.");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

bot.catch(err => console.error("Bot error:", err));
bot.start();
console.log("FIACB Advanced Decoder Bot started.");
