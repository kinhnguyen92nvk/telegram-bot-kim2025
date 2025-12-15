/**
 * KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN
 * VERSION: KIM-SO-KIM-FINAL-2025-12-15
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

console.log("🚀 RUNNING: KIM-SO-KIM-FINAL-2025-12-15");

/* ================= ENV ================= */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/google-service-account.json";

/* ================= CONFIG ================= */
const MAX_DAY = {
  A14: 69,
  A27: 60,
  A22: 60,
  "34": 109,
  B17: 69,
  B24: 69,
  C11: 59,
  C12: 59,
};

const BAO_RATE = 1.4;
const CUT_INTERVAL_DAYS = 15;
const DELETE_CODE = "2525";

/* ================= BASIC ================= */
app.get("/", (_, res) => res.send("KIM BOT OK"));
app.get("/ping", (_, res) =>
  res.json({ ok: true, version: "KIM-SO-KIM-FINAL-2025-12-15" })
);

/* ================= GOOGLE SHEET ================= */
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function getRows() {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A2:L",
  });
  return r.data.values || [];
}

async function appendRow(row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

async function clearAllData() {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A2:L",
  });
}

async function clearLastRow() {
  const rows = await getRows();
  if (!rows.length) return false;
  const idx = rows.length + 1;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `DATA!A${idx}:L${idx}`,
  });
  return true;
}

/* ================= TELEGRAM ================= */
async function send(chatId, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
}

/* ================= MENU ================= */
async function sendMenu(chatId) {
  const reply_markup = {
    inline_keyboard: [
      [{ text: "📅 Thống kê tháng hiện tại", callback_data: "MONTH" }],
      [{ text: "🔁 Thống kê theo VÒNG", callback_data: "VONG" }],
      [{ text: "📍 Thống kê theo BÃI", callback_data: "BAI" }],
      [{ text: "✏️ Sửa dòng gần nhất", callback_data: "EDIT_HELP" }],
      [{ text: "🗑️ Xoá dòng gần nhất", callback_data: "DEL_CONFIRM" }],
      [{ text: "⚠️ XOÁ SẠCH DỮ LIỆU", callback_data: "RESET_CONFIRM" }],
    ],
  };

  await send(chatId, "📌 MENU SỔ KIM\nChọn chức năng bên dưới:", { reply_markup });
}

/* ================= TIME ================= */
function kst(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000);
}
function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function fmtDayVN(d) {
  const days = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}
function moneyToTrieu(won) {
  return `${Math.round(won / 1_000_000)} triệu`;
}

/* ================= PARSE ================= */
function parseWork(text) {
  const parts = text.trim().split(/\s+/);
  const bai = parts[0]?.toUpperCase();
  if (!MAX_DAY[bai]) return null;

  let g = null, b = null, k = null, d = null;

  for (const p of parts) {
    if (/^\d+g$/i.test(p)) g = +p.slice(0, -1);
    if (/^\d+b$/i.test(p)) b = +p.slice(0, -1);
    if (/^\d+k$/i.test(p)) k = +p.slice(0, -1);
    if (/^\d+d$/i.test(p)) d = +p.slice(0, -1);
  }

  if (!b || !k) return null;
  if (!g) g = MAX_DAY[bai];

  return { bai, g, b, k, d };
}

/* ================= VÒNG ================= */
function calcVong(objs, bai, g) {
  const done = objs.filter(o => o.bai === bai && o.g === o.maxG).length;
  return g === MAX_DAY[bai] ? done + 1 : Math.max(1, done + 1);
}

/* ================= STATS ================= */
function parseRow(r) {
  return {
    date: r[1],
    user: r[2],
    bai: r[3],
    g: +r[4],
    maxG: +r[5],
    tinh: r[6],
    b: +r[7],
    bc: +r[8],
    k: +r[9],
    won: +r[10],
  };
}

/* ================= CALLBACK ================= */
let pendingDelete = new Map();

async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const data = cb.data;

  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cb.id }),
  });

  if (data === "MONTH") {
    const rows = (await getRows()).map(parseRow);
    const m = ymd(kst()).slice(0, 7);
    let days = new Set();
    let total = 0;
    for (const o of rows) {
      if (o.date.startsWith(m) && o.won > 0) {
        days.add(o.date);
        total += o.won;
      }
    }
    return send(chatId, `📅 THỐNG KÊ THÁNG ${m}\n• Số ngày làm: ${days.size}\n• Tổng doanh thu: ${total.toLocaleString()} ₩`);
  }

  if (data === "DEL_CONFIRM") {
    pendingDelete.set(chatId, "DEL_LAST");
    return send(chatId, "⚠️ Nhập mã **2525** để XOÁ DÒNG GẦN NHẤT", { parse_mode: "Markdown" });
  }

  if (data === "RESET_CONFIRM") {
    pendingDelete.set(chatId, "RESET_ALL");
    return send(chatId, "⚠️ Nhập mã **2525** để XOÁ SẠCH DỮ LIỆU", { parse_mode: "Markdown" });
  }

  if (data === "EDIT_HELP") {
    return send(chatId, "✏️ Gõ:\n`SUA A27 60b 220k`", { parse_mode: "Markdown" });
  }

  if (data === "VONG") {
    const rows = (await getRows()).map(parseRow);
    let map = {};
    for (const o of rows) {
      if (!o.bai) continue;
      const v = calcVong(rows, o.bai, o.g);
      map[v] = (map[v] || 0) + o.won;
    }
    let out = "🔁 THỐNG KÊ THEO VÒNG\n";
    Object.keys(map).sort().forEach(v => out += `• Vòng ${v}: ${map[v].toLocaleString()} ₩\n`);
    return send(chatId, out.trim());
  }

  if (data === "BAI") {
    const rows = (await getRows()).map(parseRow);
    let map = {};
    for (const o of rows) {
      if (!o.bai) continue;
      map[o.bai] = (map[o.bai] || 0) + o.won;
    }
    let out = "📍 THỐNG KÊ THEO BÃI\n";
    Object.keys(map).forEach(b => out += `• ${b}: ${map[b].toLocaleString()} ₩\n`);
    return send(chatId, out.trim());
  }
}

/* ================= MESSAGE ================= */
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const name = msg.from.first_name;
  const text = (msg.text || "").trim();

  if (text === "/menu" || text.toLowerCase() === "menu") {
    return sendMenu(chatId);
  }

  if (pendingDelete.has(chatId)) {
    if (text === DELETE_CODE) {
      const type = pendingDelete.get(chatId);
      pendingDelete.delete(chatId);
      if (type === "DEL_LAST") {
        await clearLastRow();
        return send(chatId, "✅ Đã xoá dòng gần nhất.");
      }
      if (type === "RESET_ALL") {
        await clearAllData();
        return send(chatId, "✅ Đã xoá sạch dữ liệu.");
      }
    } else {
      pendingDelete.delete(chatId);
      return send(chatId, "❌ Sai mã xác nhận.");
    }
  }

  const parsed = parseWork(text);
  if (!parsed) {
    return send(chatId,
`❌ Nhập sai rồi bạn iu ơi 😅
Ví dụ:
A27 60b 220k
A27 30g 40b 220k
A27 80b 120k 5d`);
  }

  const now = kst();
  const workDate = parsed.d
    ? new Date(now.getFullYear(), now.getMonth(), parsed.d)
    : new Date(now.getTime() - 86400000);

  const bc = Math.round(parsed.b * BAO_RATE);
  const money = bc * parsed.k * 1000;

  const rows = (await getRows()).map(parseRow);
  const totalBefore = rows.reduce((s,o)=>s+o.won,0);
  const vong = calcVong(rows, parsed.bai, parsed.g);

  await appendRow([
    new Date().toISOString(),
    ymd(workDate),
    name,
    parsed.bai,
    parsed.g,
    MAX_DAY[parsed.bai],
    parsed.g === MAX_DAY[parsed.bai] ? "Cắt sạch" : "Chưa sạch",
    parsed.b,
    bc,
    parsed.k,
    money,
    "",
  ]);

  const forecast = new Date(workDate.getTime() + CUT_INTERVAL_DAYS * 86400000);

  await send(chatId,
`--- 🌊 SỔ KIM (Vòng: ${vong}) ---
Chào ${name}, đây là kết quả của lệnh bạn gửi

📅 Ngày: ${fmtDayVN(workDate)}
📍 Vị trí: ${parsed.bai}
✂️ Tình hình: Cắt sạch (${parsed.g}/${MAX_DAY[parsed.bai]} dây)
📦 Sản lượng: ${parsed.b} bao lớn (≈ ${bc} bao tính tiền)
💰 Giá: ${parsed.k}k

💵 THU HÔM NAY: ${money.toLocaleString()} ₩
🏆 TỔNG THU TỚI THỜI ĐIỂM NÀY: ${moneyToTrieu(totalBefore + money)} ₩
----------------------------------
(Dự báo nhanh: Bãi này sẽ cắt lại vào ${forecast.getDate()}/${forecast.getMonth()+1}/${forecast.getFullYear()})`
  );
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    if (req.body.callback_query) await handleCallback(req.body.callback_query);
    if (req.body.message) await handleMessage(req.body.message);
  } catch (e) {
    console.error("ERR:", e);
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("✅ KIM BOT READY on", PORT));
