import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

/* ================== CONFIG ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH || "kim2025";
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const app = express();
app.use(express.json());

/* ================== GOOGLE SHEET ================== */
const auth = new google.auth.JWT(
  CLIENT_EMAIL,
  null,
  PRIVATE_KEY,
  ["https://www.googleapis.com/auth/spreadsheets"]
);
const sheets = google.sheets({ version: "v4", auth });

/* ================== UTIL ================== */
function nowKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function formatDateYYYYMMDD(d) {
  return d.toISOString().slice(0, 10);
}

function defaultDateYesterday() {
  const d = nowKST();
  d.setUTCDate(d.getUTCDate() - 1);
  return formatDateYYYYMMDD(d);
}

function formatWon(n) {
  return n.toLocaleString("ko-KR");
}

function formatWonAndMillion(n) {
  if (n >= 1_000_000) {
    return `${formatWon(n)} ₩ (≈ ${(n / 1_000_000).toFixed(2)} triệu)`;
  }
  return `${formatWon(n)} ₩`;
}

/* ================== KEYBOARD ================== */
function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "➕ Nhập chuyến mới" }],
      [{ text: "📊 Tổng hôm nay" }, { text: "🏁 Tổng cả vụ" }],
      [{ text: "❓ Hướng dẫn" }],
    ],
    resize_keyboard: true,
  };
}

/* ================== SHEET HELPERS ================== */
async function appendRow(row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "DATA!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

async function readAllRows() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "DATA!A2:K",
  });
  return res.data.values || [];
}

async function sumSeason() {
  const rows = await readAllRows();
  return rows.reduce((s, r) => {
    const v = Number(String(r[10] || "").replace(/[^\d]/g, ""));
    return s + (isNaN(v) ? 0 : v);
  }, 0);
}

async function sumByDate(date) {
  const rows = await readAllRows();
  return rows.reduce((s, r) => {
    if (r[1] === date) {
      const v = Number(String(r[10] || "").replace(/[^\d]/g, ""));
      return s + (isNaN(v) ? 0 : v);
    }
    return s;
  }, 0);
}

/* ================== PARSE INPUT ================== */
function parseInput(text) {
  text = text.toLowerCase().trim();

  if (text === "tổng" || text.includes("tổng cả vụ"))
    return { type: "sum_season" };
  if (text.includes("tổng hôm nay"))
    return { type: "sum_today" };
  if (text.includes("hướng dẫn"))
    return { type: "help" };

  const m = text.match(/^([a-z0-9]+)\s+(.*)$/i);
  if (!m) return null;

  const pos = m[1].toUpperCase();
  const rest = m[2];

  const b = rest.match(/(\d+)\s*b/);
  const k = rest.match(/(\d+)\s*k/);
  if (!b || !k) return null;

  const baoTau = Number(b[1]);
  const giaK = Number(k[1]);
  const baoChuan = Math.round(baoTau * 1.4);
  const thuLoWon = baoChuan * giaK * 1000;

  // ngày mùng
  let date;
  const md = rest.match(/(\d+)\s*d/);
  if (md) {
    const day = Number(md[1]);
    const now = nowKST();
    let month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    if (day > now.getUTCDate()) month -= 1;
    if (month <= 0) month = 12;
    date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else {
    date = defaultDateYesterday();
  }

  return {
    type: "entry",
    pos,
    baoTau,
    baoChuan,
    giaK,
    thuLoWon,
    date,
  };
}

/* ================== TELEGRAM ================== */
async function tg(method, body) {
  await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ================== WEBHOOK ================== */
app.post(`/${SECRET_PATH}`, async (req, res) => {
  try {
    const msg = req.body.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text || "";
    const p = parseInput(text);

    if (!p) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "⚠️ Nhập sai!\nVí dụ: A27 60b 220k 5d",
        reply_markup: mainKeyboard(),
      });
      return res.sendStatus(200);
    }

    if (p.type === "help") {
      await tg("sendMessage", {
        chat_id: chatId,
        text:
          "📌 HƯỚNG DẪN\n\n" +
          "• Nhập nhanh: A27 60b 220k\n" +
          "• Ngày mùng: thêm 5d (mùng 5)\n" +
          "• Bao chuẩn = bao x 1.4\n" +
          "• Bot tự cộng dồn cả vụ",
        reply_markup: mainKeyboard(),
      });
      return res.sendStatus(200);
    }

    if (p.type === "sum_season") {
      const total = await sumSeason();
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🏁 **TỔNG THU HIỆN TẠI:** ${formatWonAndMillion(total)}`,
        parse_mode: "Markdown",
        reply_markup: mainKeyboard(),
      });
      return res.sendStatus(200);
    }

    if (p.type === "sum_today") {
      const today = formatDateYYYYMMDD(nowKST());
      const total = await sumByDate(today);
      await tg("sendMessage", {
        chat_id: chatId,
        text: `📊 **TỔNG HÔM NAY:** ${formatWonAndMillion(total)}`,
        parse_mode: "Markdown",
        reply_markup: mainKeyboard(),
      });
      return res.sendStatus(200);
    }

    // ENTRY
    await appendRow([
      new Date().toISOString(),
      p.date,
      "",
      p.pos,
      "",
      "",
      "Cắt",
      p.baoTau,
      p.baoChuan,
      p.giaK,
      p.thuLoWon,
      "",
    ]);

    const totalDay = await sumByDate(p.date);
    const totalSeason = await sumSeason();

    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `🌊 **SỔ KIM**\n\n` +
        `📅 Ngày: ${p.date}\n` +
        `📍 Bãi: ${p.pos}\n` +
        `📦 ${p.baoTau} bao → ${p.baoChuan} bao chuẩn\n` +
        `💰 Giá: ${p.giaK}k\n\n` +
        `🧾 Thu lô này: ${formatWonAndMillion(p.thuLoWon)}\n` +
        `📊 Thu ngày ${p.date}: ${formatWonAndMillion(totalDay)}\n` +
        `🏁 Tổng cả vụ: ${formatWonAndMillion(totalSeason)}`,
      parse_mode: "Markdown",
      reply_markup: mainKeyboard(),
    });

    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(200);
  }
});

/* ================== START ================== */
app.get("/", (_, res) => res.send("KIM BOT RUNNING"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot running on", PORT));
