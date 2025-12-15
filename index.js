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
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/google-service-account.json";

// Bảo vệ bot: chỉ cho phép chatId trong ALLOWED_CHATS (ngăn người lạ)
const ALLOWED_CHATS = (process.env.ALLOWED_CHATS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean); // ví dụ: "123, -100999"

// Rate limit đơn giản (ms)
const MIN_GAP_MS = Number(process.env.MIN_GAP_MS || 800);

/* ================== BASIC ROUTES ================== */
app.get("/", (req, res) => res.status(200).send("OK - telegram-bot-kim2025"));
app.get("/ping", (req, res) => res.status(200).json({ ok: true, t: Date.now() }));

/* ================== GOOGLE SHEET ================== */
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function appendRow(tab, rowValues) {
  if (!GOOGLE_SHEET_ID) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowValues] },
  });
}

async function getRows(tab, rangeA1) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${tab}!${rangeA1}`,
  });
  return resp?.data?.values || [];
}

async function sendMessage(chat_id, text) {
  if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
  return fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

async function log(level, message) {
  console.log(level, message);
  try {
    await appendRow("Log", [new Date().toISOString(), level, String(message).slice(0, 4000)]);
  } catch (e) {
    console.error("LOG->SHEET ERROR:", e?.message || e);
  }
}

/* ================== BOT GUARDS ================== */
// chống xử lý trùng + chống spam nhanh
const seenUpdateIds = new Set();
const lastChatAt = new Map();

function isAllowedChat(chatId) {
  if (!ALLOWED_CHATS.length) return true; // nếu bạn chưa set ALLOWED_CHATS thì cho phép tất cả
  return ALLOWED_CHATS.includes(String(chatId));
}

function rateLimited(chatId) {
  const now = Date.now();
  const last = lastChatAt.get(chatId) || 0;
  if (now - last < MIN_GAP_MS) return true;
  lastChatAt.set(chatId, now);
  return false;
}

/* ================== PARSER THU HOACH ================== */
/**
 * Nhập dạng:
 *  - "A27 60b 220k"
 *  - "B24 84 140k cat sach"
 *  - "C11 59b 180" (coi 180 = 180k)
 *
 * Trả về: { bai, bao, gia_k, tinh_trang, ghi_chu }
 */
function parseThuHoach(textRaw) {
  const text = textRaw.trim();

  // lệnh báo cáo
  const lower = text.toLowerCase();
  if (lower.includes("tổng hôm nay")) return { cmd: "TODAY" };
  if (lower.includes("tổng cả vụ") || lower.includes("tong ca vu")) return { cmd: "ALL" };

  // Pattern: bai (A27/B24/34...), bao (60 hoặc 60b), gia (220k hoặc 220)
  const m = text.match(/^\s*([A-Za-z]?\d{1,3})\s+(\d+)\s*(?:b|bao)?\s+(\d+)\s*(?:k)?\s*(.*)$/i);
  if (!m) return null;

  const bai = m[1].toUpperCase();
  const bao = Number(m[2]);
  let gia_k = Number(m[3]);
  if (!Number.isFinite(gia_k)) return null;
  // nếu người dùng nhập "220k" hoặc "220" đều hiểu là 220k
  // (ở đây gia_k chính là đơn vị k)
  const tail = (m[4] || "").trim();

  // tách tình trạng / ghi chú đơn giản
  let tinh_trang = "";
  let ghi_chu = "";
  if (tail) {
    // nếu có cụm "cắt sạch" hoặc "cat sach" thì coi là tình trạng
    const t = tail.toLowerCase();
    if (t.includes("cắt sạch") || t.includes("cat sach")) tinh_trang = "Cắt sạch";
    else if (t.includes("cắt") || t.includes("cat")) tinh_trang = "Cắt";
    else if (t.includes("nghỉ") || t.includes("nghi")) tinh_trang = "Nghỉ";
    else ghi_chu = tail;
    if (!ghi_chu && tail && tinh_trang) {
      // phần còn lại làm ghi chú (tối giản)
      ghi_chu = tail.replace(/cắt sạch|cat sach|cắt|cat|nghỉ|nghi/gi, "").trim();
    }
  }

  return { bai, bao, gia_k, tinh_trang, ghi_chu };
}

/* ================== REPORTS ================== */
function isSameKSTDate(isoTime, targetDateKST) {
  // isoTime: "2025-12-15T....Z" -> so sánh theo KST (+09)
  const d = new Date(isoTime);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const key = `${y}-${m}-${day}`;
  return key === targetDateKST;
}

function todayKSTKey() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function reportToday() {
  const rows = await getRows("THU_HOACH", "A2:I");
  const key = todayKSTKey();

  let totalBao = 0;
  let totalWonK = 0;
  const byBai = new Map();

  for (const r of rows) {
    const time = r[0];
    const bai = r[1];
    const bao = Number(r[2] || 0);
    const gia_k = Number(r[3] || 0);
    if (!time || !bai) continue;
    if (!isSameKSTDate(time, key)) continue;

    totalBao += bao;
    totalWonK += bao * gia_k;

    const cur = byBai.get(bai) || { bao: 0, wonK: 0 };
    cur.bao += bao;
    cur.wonK += bao * gia_k;
    byBai.set(bai, cur);
  }

  const lines = [];
  lines.push(`📊 TỔNG HÔM NAY (KST) ${key}`);
  lines.push(`• Tổng bao: ${totalBao}`);
  lines.push(`• Tổng tiền: ${totalWonK.toLocaleString()}k`);

  const sorted = [...byBai.entries()].sort((a, b) => b[1].wonK - a[1].wonK);
  if (sorted.length) {
    lines.push("");
    lines.push("📍 Theo bãi:");
    for (const [bai, v] of sorted) {
      lines.push(`- ${bai}: ${v.bao} bao • ${v.wonK.toLocaleString()}k`);
    }
  }

  return lines.join("\n");
}

async function reportAll() {
  const rows = await getRows("THU_HOACH", "A2:I");

  let totalBao = 0;
  let totalWonK = 0;
  const byBai = new Map();

  for (const r of rows) {
    const bai = r[1];
    const bao = Number(r[2] || 0);
    const gia_k = Number(r[3] || 0);
    if (!bai) continue;

    totalBao += bao;
    totalWonK += bao * gia_k;

    const cur = byBai.get(bai) || { bao: 0, wonK: 0 };
    cur.bao += bao;
    cur.wonK += bao * gia_k;
    byBai.set(bai, cur);
  }

  const lines = [];
  lines.push("📈 TỔNG CẢ VỤ");
  lines.push(`• Tổng bao: ${totalBao}`);
  lines.push(`• Tổng tiền: ${totalWonK.toLocaleString()}k`);

  const sorted = [...byBai.entries()].sort((a, b) => b[1].wonK - a[1].wonK);
  if (sorted.length) {
    lines.push("");
    lines.push("📍 Theo bãi:");
    for (const [bai, v] of sorted) {
      lines.push(`- ${bai}: ${v.bao} bao • ${v.wonK.toLocaleString()}k`);
    }
  }
  return lines.join("\n");
}

/* ================== WEBHOOK ================== */
app.post("/webhook", async (req, res) => {
  // trả 200 ngay để Telegram không retry
  res.sendStatus(200);

  try {
    const update = req.body;
    const updateId = update?.update_id;

    if (updateId != null) {
      if (seenUpdateIds.has(updateId)) return; // chống trùng
      seenUpdateIds.add(updateId);
      // giữ set nhỏ
      if (seenUpdateIds.size > 2000) {
        const first = seenUpdateIds.values().next().value;
        seenUpdateIds.delete(first);
      }
    }

    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = msg?.text;
    const from = msg?.from;
    const msgId = msg?.message_id;

    if (!chatId || !text) return;

    // khóa bot theo chat
    if (!isAllowedChat(chatId)) return;

    // rate limit
    if (rateLimited(chatId)) return;

    // /start
    if (text === "/start") {
      await sendMessage(
        chatId,
        "Bot KIM 2025 OK ✅\n\n✅ Nhập thu hoạch: A27 60b 220k (có thể thêm 'cắt sạch')\n📊 Lệnh: Tổng hôm nay | Tổng cả vụ"
      );
      return;
    }

    // command report
    const parsed = parseThuHoach(text);
    if (parsed?.cmd === "TODAY") {
      const rep = await reportToday();
      await sendMessage(chatId, rep);
      return;
    }
    if (parsed?.cmd === "ALL") {
      const rep = await reportAll();
      await sendMessage(chatId, rep);
      return;
    }

    // thu hoạch
    if (!parsed) {
      await sendMessage(
        chatId,
        "Chưa đúng cú pháp.\nVí dụ: A27 60b 220k cắt sạch\nHoặc gõ: Tổng hôm nay / Tổng cả vụ"
      );
      return;
    }

    const userName =
      [from?.first_name, from?.last_name].filter(Boolean).join(" ") ||
      from?.username ||
      "unknown";

    // ghi vào sheet
    const row = [
      new Date().toISOString(),
      parsed.bai,
      parsed.bao,
      parsed.gia_k,
      parsed.tinh_trang || "",
      parsed.ghi_chu || "",
      userName,
      String(chatId),
      String(msgId || ""),
    ];
    await appendRow("THU_HOACH", row);

    await sendMessage(
      chatId,
      `✅ Đã lưu: ${parsed.bai} • ${parsed.bao} bao • ${parsed.gia_k}k` +
        (parsed.tinh_trang ? ` • ${parsed.tinh_trang}` : "")
    );
  } catch (e) {
    await log("ERROR", e?.message || e);
  }
});

/* ================== START SERVER (RENDER PORT) ================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ KIM bot running on port", PORT);
});
