/**
 * ============================================
 *  KIM BOT 2025 – DATA SHEET FINAL
 *  VERSION: KIM-BOT-DATA-v2025.12.15-FINAL
 * ============================================
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

/* ================== VERSION LOG ================== */
console.log("🚀 RUNNING VERSION: KIM-BOT-DATA-v2025.12.15-FINAL");

/* ================== ENV ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/google-service-account.json";

/* ================== BASIC ROUTES ================== */
app.get("/", (req, res) => res.send("OK - KIM BOT DATA FINAL"));
app.get("/ping", (req, res) => res.json({ ok: true, version: "KIM-BOT-DATA-v2025.12.15-FINAL" }));

/* ================== GOOGLE SHEET ================== */
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function appendRow(row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

async function getAllRows() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A2:L",
  });
  return res.data.values || [];
}

/* ================== TELEGRAM ================== */
async function sendMessage(chatId, text) {
  return fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

/* ================== PARSER ================== */
function parseInput(text) {
  const lower = text.toLowerCase();

  if (lower.includes("tổng hôm nay")) return { cmd: "TODAY" };
  if (lower.includes("tổng cả vụ")) return { cmd: "ALL" };

  const m = text.match(/^\s*([A-Za-z]?\d{1,3})\s+(\d+)\s*(?:b|bao)?\s+(\d+)\s*(?:k)?\s*(.*)$/i);
  if (!m) return null;

  return {
    viTri: m[1].toUpperCase(),
    dayG: Number(m[2]),
    giaK: Number(m[3]),
    tinhHinh: m[4]?.trim() || "Cắt sạch",
  };
}

/* ================== REPORT ================== */
function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function reportToday() {
  const rows = await getAllRows();
  const today = todayKST();

  let total = 0;
  let money = 0;

  for (const r of rows) {
    if (r[1] === today) {
      total += Number(r[8] || 0);
      money += Number(r[10] || 0);
    }
  }

  return `📊 TỔNG HÔM NAY (${today})\n• Bao chuẩn: ${total}\n• Thu lợi: ${money.toLocaleString()}k`;
}

async function reportAll() {
  const rows = await getAllRows();
  let total = 0;
  let money = 0;

  for (const r of rows) {
    total += Number(r[8] || 0);
    money += Number(r[10] || 0);
  }

  return `📈 TỔNG CẢ VỤ\n• Bao chuẩn: ${total}\n• Thu lợi: ${money.toLocaleString()}k`;
}

/* ================== WEBHOOK ================== */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const msg = req.body?.message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const text = msg.text;
    const user =
      msg.from.first_name ||
      msg.from.username ||
      "unknown";

    if (text === "/start") {
      await sendMessage(
        chatId,
        "✅ Bot KIM 2025 OK\nNhập: A27 60b 220k\nLệnh: Tổng hôm nay | Tổng cả vụ"
      );
      return;
    }

    const parsed = parseInput(text);

    if (parsed?.cmd === "TODAY") {
      await sendMessage(chatId, await reportToday());
      return;
    }

    if (parsed?.cmd === "ALL") {
      await sendMessage(chatId, await reportAll());
      return;
    }

    if (!parsed) {
      await sendMessage(chatId, "❌ Sai cú pháp. VD: A27 60b 220k");
      return;
    }

    const now = new Date();
    const dateKST = todayKST();

    const baoChuan = parsed.dayG;
    const thuLo = baoChuan * parsed.giaK;

    const row = [
      now.toISOString(),       // A Timestamp
      dateKST,                 // B Date
      user,                    // C Thu
      parsed.viTri,            // D ViTri
      parsed.dayG,             // E DayG
      parsed.dayG,             // F MaxG
      parsed.tinhHinh,         // G TinhHinh
      parsed.dayG,             // H BaoTau
      baoChuan,                // I BaoChuan
      parsed.giaK,             // J GiaK
      thuLo,                   // K ThuLoWon
      ""                        // L Note
    ];

    await appendRow(row);

    await sendMessage(
      chatId,
      `✅ Đã lưu: ${parsed.viTri} • ${baoChuan} bao • ${parsed.giaK}k • ${thuLo.toLocaleString()}k`
    );
  } catch (e) {
    console.error("❌ WEBHOOK ERROR:", e.message);
  }
});

/* ================== START ================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ KIM BOT running on port", PORT);
});
