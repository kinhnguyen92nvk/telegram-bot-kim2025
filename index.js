import express from "express";
import { google } from "googleapis";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_PATH = process.env.SECRET_PATH || "kim2025";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

// ====== Bãi chuẩn (max dây) ======
const BEACH_MAX_G = {
  A14: 69, A27: 59, A22: 59, "34": 109,
  B17: 69, B24: 69, C11: 59, C12: 59,
};

function nowKST() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}
function formatDateYYYYMMDD(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function defaultDateYesterday() {
  const kst = nowKST();
  const y = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  return formatDateYYYYMMDD(y);
}
function roundInt(x) { return Math.round(Number(x)); }
function formatWon(n) { return Number(n).toLocaleString("en-US"); }
function formatWonAndMillion(n) {
  const won = Number(n);
  const wonText = formatWon(won);
  if (won >= 1_000_000) {
    const tr = (won / 1_000_000).toFixed(2).replace(/\.00$/, "");
    return `${wonText} ₩ (≈ ${tr} triệu)`;
  }
  return `${wonText} ₩`;
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "➕ Nhập chuyến mới" }],
      [{ text: "📊 Tổng hôm nay" }, { text: "🏁 Tổng cả vụ" }],
      [{ text: "❓ Hướng dẫn" }]
    ],
    resize_keyboard: true
  };
}

async function tg(method, body) {
  const r = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ====== Google Sheets client ======
function getSheetsClient() {
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) return null;

  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

async function appendRowToSheet(row) {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error("Missing Google env (SHEET_ID/CLIENT_EMAIL/PRIVATE_KEY)");

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A:L",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

async function readAllRows() {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error("Missing Google env (SHEET_ID/CLIENT_EMAIL/PRIVATE_KEY)");

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A:L",
  });

  const values = res.data.values || [];
  if (values.length <= 1) return []; // bỏ header
  return values.slice(1);
}

async function sumSeason() {
  const rows = await readAllRows();
  let total = 0;
  for (const r of rows) {
    const val = r[10]; // ThuLoWon cột K
    const num = Number(String(val || "").replace(/[^\d]/g, ""));
    if (!Number.isNaN(num)) total += num;
  }
  return total;
}

async function sumByDate(dateYYYYMMDD) {
  const rows = await readAllRows();
  let total = 0;
  for (const r of rows) {
    const date = r[1]; // Date cột B
    if (date === dateYYYYMMDD) {
      const val = r[10];
      const num = Number(String(val || "").replace(/[^\d]/g, ""));
      if (!Number.isNaN(num)) total += num;
    }
  }
  return total;
}

function forecastCutDate(dateYYYYMMDD) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const next = new Date(base.getTime() + 15 * 24 * 60 * 60 * 1000);
  return formatDateYYYYMMDD(next);
}

function parseInput(textRaw) {
  const text = (textRaw || "").trim();
  if (!text) return { ok: false };

  const t = text.toLowerCase().trim();

  // nút bấm / lệnh
  if (t === "❓ hướng dẫn" || t === "hướng dẫn" || t === "/help" || t === "help") {
    return { ok: true, type: "help" };
  }
  if (t === "🏁 tổng cả vụ" || t === "tổng cả vụ" || t === "tổng") {
    return { ok: true, type: "sum_season" };
  }
  if (t === "📊 tổng hôm nay" || t === "tổng hôm nay") {
    return { ok: true, type: "sum_today" };
  }
  if (t === "➕ nhập chuyến mới") {
    return { ok: true, type: "help_short" };
  }

  // chuẩn hoá
  const norm = text.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  const parts = norm.split(" ");
  const pos = parts[0].toUpperCase();
  if (!BEACH_MAX_G[pos]) return { ok: false, reason: "Vị trí không hợp lệ" };

  const rest = parts.slice(1).join(" ").toLowerCase();

  // bao
  let b = null;
  const mB = rest.match(/(\d+)\s*(b|bao)\b/);
  if (mB) b = Number(mB[1]);
  if (b === null) {
    const nums = rest.match(/\d+/g) || [];
    if (nums.length >= 2) b = Number(nums[0]);
  }

  // giá k
  let k = null;
  const mK = rest.match(/(\d+)\s*k\b/);
  if (mK) k = Number(mK[1]);
  if (k === null) {
    const nums = rest.match(/\d+/g) || [];
    if (nums.length >= 2) k = Number(nums[1]);
  }

  // g (dây)
  let g = null;
  const mG = rest.match(/(\d+)\s*g\b/);
  if (mG) g = Number(mG[1]);

  // d = ngày mùng
  let date = null;
  const mD = rest.match(/(\d+)\s*d\b/);
  if (mD) {
    const dayOfMonth = Number(mD[1]);
    const kst = nowKST();
    const yyyy = kst.getUTCFullYear();
    let mm = kst.getUTCMonth() + 1;
    const todayDay = kst.getUTCDate();

    if (dayOfMonth > todayDay) mm -= 1;
    if (mm <= 0) mm = 12;

    const dd = String(dayOfMonth).padStart(2, "0");
    const mm2 = String(mm).padStart(2, "0");
    date = `${yyyy}-${mm2}-${dd}`;
  } else {
    date = defaultDateYesterday();
  }

  if (b === null || k === null) return { ok: false, reason: "Thiếu bao hoặc giá" };

  const maxG = BEACH_MAX_G[pos];
  const dayG = g === null ? maxG : g;
  const tinhHinh = g === null ? "Cắt sạch" : "Cắt dở";

  const baoTau = Number(b);
  const baoChuan = roundInt(baoTau * 1.4);
  const giaK = Number(k);
  const thuLoWon = baoChuan * (giaK * 1000);

  return {
    ok: true,
    type: "entry",
    data: { date, pos, dayG, maxG, tinhHinh, baoTau, baoChuan, giaK, thuLoWon }
  };
}

async function handleMessage(chatId, text) {
  const parsed = parseInput(text);

  if (!parsed.ok) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⚠️ Nhập sai!\nVí dụ đúng:\nA27 60b 220k\nA27 65b 220k 5d\n(5d = ngày mùng 5)`,
      reply_markup: mainKeyboard(),
    });
    return;
  }

  if (parsed.type === "help" || parsed.type === "help_short") {
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `📌 HƯỚNG DẪN\n` +
        `• Nhập: A27 60b 220k\n` +
        `• Thêm dây: A27 30g 60b 220k\n` +
        `• Thêm ngày mùng: A27 60b 220k 5d (mùng 5)\n` +
        `• Không nhập g = mặc định CẮT SẠCH (Max dây)\n` +
        `• Không nhập d = mặc định HÔM QUA\n\n` +
        `Lệnh: Tổng / Tổng hôm nay / Tổng cả vụ`,
      reply_markup: mainKeyboard(),
    });
    return;
  }

  if (parsed.type === "sum_season") {
    const total = await sumSeason();
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🏁 **TỔNG THU HIỆN TẠI (CẢ VỤ):** ${formatWonAndMillion(total)}`,
      parse_mode: "Markdown",
      reply_markup: mainKeyboard(),
    });
    return;
  }

  if (parsed.type === "sum_today") {
    const today = formatDateYYYYMMDD(nowKST());
    const total = await sumByDate(today);
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📊 **TỔNG HÔM NAY:** ${formatWonAndMillion(total)}`,
      parse_mode: "Markdown",
      reply_markup: mainKeyboard(),
    });
    return;
  }

  // entry
  const d = parsed.data;

  const row = [
    new Date().toISOString(), // Timestamp
    d.date,                   // Date
    "",                       // Thu
    d.pos,                    // ViTri
    d.dayG,                   // DayG
    d.maxG,                   // MaxG
    d.tinhHinh,               // TinhHinh
    d.baoTau,                 // BaoTau
    d.baoChuan,               // BaoChuan
    d.giaK,                   // GiaK
    d.thuLoWon,               // ThuLoWon
    ""                        // Note
  ];
  await appendRowToSheet(row);

  const totalSeason = await sumSeason();
  const totalThatDay = await sumByDate(d.date);
  const nextCut = forecastCutDate(d.date);

  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `🌊 **SỔ KIM**\n` +
      `📅 **Ngày:** ${d.date}\n` +
      `📍 **Vị trí:** ${d.pos}\n` +
      `✂️ **Tình hình:** ${d.tinhHinh} (${d.dayG}/${d.maxG}g)\n` +
      `📦 **Sản lượng:** ${d.baoTau} bao lớn (≈ ${d.baoChuan} bao tính tiền)\n` +
      `💰 **Giá:** ${d.giaK}k\n\n` +
      `🧾 **THU LÔ NÀY:** ${formatWonAndMillion(d.thuLoWon)}\n` +
      `📊 **THU NGÀY ${d.date}:** ${formatWonAndMillion(totalThatDay)}\n` +
      `🏁 **TỔNG THU HIỆN TẠI:** ${formatWonAndMillion(totalSeason)}\n` +
      `----------------------------------\n` +
      `*(Dự báo: cắt lại vào ${nextCut})*`,
    parse_mode: "Markdown",
    reply_markup: mainKeyboard(),
  });
}

app.post(`/${SECRET_PATH}`, async (req, res) => {
  try {
    const msg = req.body.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (text === "/start") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "👋 Bot Kim sẵn sàng.\nNhập ví dụ: A27 60b 220k",
        reply_markup: mainKeyboard(),
      });
      return res.sendStatus(200);
    }

    await handleMessage(chatId, text);
    return res.sendStatus(200);
  } catch (err) {
    console.error(err);
    return res.sendStatus(200);
  }
});

app.get("/", (req, res) => res.send("Bot is running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot running on port", PORT));
