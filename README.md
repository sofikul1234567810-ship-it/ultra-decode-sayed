# FIACB Advanced Decoder Bot

This version uses WebCrack to attempt deobfuscation of common JavaScript patterns. HTML uploads are returned as `.html`, JavaScript uploads as `.js`, and text uploads as `.txt`. It also returns a report.

## Deploy on Render
1. Upload the package contents to a GitHub repository.
2. In Render, choose **New → Blueprint** and connect the repository.
3. Set the secret environment variable `BOT_TOKEN` using the token from Telegram's `@BotFather`.
4. Deploy the background worker.

Build command: `npm install`
Start command: `npm start`

## Limitations
No bot can guarantee decoding every HTML/JavaScript protection. Custom encryption, runtime-only payloads, integrity checks, and protected access may remain unresolved. This bot does not execute uploaded code or crack passwords. Treat uploads as private and only use the bot with files you are authorized to analyze.
