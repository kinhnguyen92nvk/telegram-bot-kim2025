import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

/* ================== ENV ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/etc/secrets/google-service-account.json";

/* ================== BÃI CHUẨN ================== */
const BEACH_MAX_G = {
  A14: 69,
  A27: 59,
  A22: 59,
  "34": 109,
  B17: 69,
  B24: 69,
  C11: 59,
  C12: 59,
};

/* ================== GOOGLE SHEET ================== */
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

/* ================== TIỆN ÍCH ================== */
function nowKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function formatDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

function defaultYesterday() {
  const d = nowKST();
  d.setDate(d.getDate() - 1);
  return d;
}

/* ================== PARSE INPUT ================== */
function parseInput(text) {
  const parts = text.trim().toUpperCase().split(/\s+/);
  const result = {};

  result.beach = parts[0];
  if (!BEACH_MAX_G[result.beach]) return null;

  for (let p of parts.slice(1)) {
    if (p.endsWith("B")) result.baoTau = parseInt(p);
    else if (p.endsWith("K")) result.gia = parseInt(p);
    else if (p.endsWith("D")) result.day = parseInt(p);
    else if (/^\d+$/.test(p)) {
      if (!result.baoTau) result.baoTau = parseInt(p);
      else if (!result.gia) result.gia = parseInt(p);
    }
  }

  if (!result.baoTau || !result.gia) return null;

  // ngày
  if (result.day) {
    const d = nowKST();
    d.setDate(result.day);
    result.date = d;
  } else {
    result.date = defaultYesterday();
  }

  result.maxG = BEACH_MAX_G[result.beach];
  result.baoChuan = Math.round(result.baoTau * 1.4);
  result.doanhThu = result.baoChuan * result.gia * 1000;

  return result;
}

/* ================== GHI SHEET ================== */
async function appendSheet(row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A:Z",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row],
    },
  });
}

/* ================== ĐỌC + CỘNG DỒN ================== */
async function getAllRevenue() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A2:L",
  });

  const rows = res.data.values || [];
  let total = 0;

  for (const r of rows) {
    const val = parseInt(r[10]);
    if (!isNaN(val)) total += val;
  }
  return total;
}

async function getTodayRevenue(dateStr) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A2:L",
  });

  const rows = res.data.values || [];
  let total = 0;

  for (const r of rows) {
    if (r[1] === dateStr) {
      const val = parseInt(r[10]);
      if (!isNaN(val)) total += val;
    }
  }
  return total;
}

/* ================== TELEGRAM SEND ================== */
async function sendMessage(chatId, text, keyboard = null) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: keyboard,
    }),
  });
}

/* ================== WEBHOOK ================== */
app.post("/", async (req, res) => {
  const msg = req.body.message;
  if (!msg || !msg.text) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text.includes("HƯỚNG DẪN")) {
    return sendMessage(
      chatId,
      `📌 HƯỚNG DẪN\n\nNhập:\nA27 60 220\nA27 60b 220k\nA27 65b 220k 5d\n\n📅 5d = ngày mùng 5\n📊 Bot tự cộng dồn cả vụ`
    );
  }

  if (text.includes("TỔNG HÔM NAY")) {
    const today = formatDate(defaultYesterday());
    const sum = await getTodayRevenue(today);
    return sendMessage(
      chatId,
      `📊 TỔNG HÔM NAY\n💰 ${sum.toLocaleString()} ₩`
    );
  }

  if (text.includes("TỔNG CẢ VỤ")) {
    const sum = await getAllRevenue();
    return sendMessage(
      chatId,
      `🧾 TỔNG THU HOẠCH HIỆN TẠI\n💰 ${sum.toLocaleString()} ₩`
    );
  }

  const data = parseInput(text);
  if (!data) {
    return sendMessage(
      chatId,
      "⚠️ Nhập sai!\nVí dụ: A27 60 220 hoặc A27 65b 220k 5d"
    );
  }

  const dateStr = formatDate(data.date);

  await appendSheet([
    new Date().toISOString(),
    dateStr,
    data.beach,
    data.maxG,
    data.baoTau,
    data.baoChuan,
    data.gia,
    data.doanhThu,
  ]);

  const totalAll = await getAllRevenue();

  await sendMessage(
    chatId,
    `🌊 SỔ KIM\n\n📅 Ngày: ${dateStr}\n📍 Bãi: ${data.beach}\n📦 ${data.baoTau} bao → ${data.baoChuan} bao\n💵 Giá: ${data.gia}k\n\n💰 THU HÔM NAY: ${data.doanhThu.toLocaleString()} ₩\n📊 TỔNG THU HOẠCH HIỆN TẠI: ${totalAll.toLocaleString()} ₩`,
    {
      keyboard: [
        [{ text: "📊 Tổng hôm nay" }, { text: "🧾 Tổng cả vụ" }],
        [{ text: "❓ Hướng dẫn" }],
      ],
      resize_keyboard: true,
    }
  );

  res.sendStatus(200);
});

/* ================== START ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("🌊 SỔ KIM bot running")
);
