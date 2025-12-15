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

// Optional: khóa bot theo chat (khuyến nghị)
// VD: "123456789,-100111222333"
const ALLOWED_CHATS = (process.env.ALLOWED_CHATS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const MIN_GAP_MS = Number(process.env.MIN_GAP_MS || 600); // chống spam nhanh

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
  if (!GOOGLE_SHEET_ID) throw new Error("Missing GOOGLE_SHEET_ID");
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

/* ================== TELEGRAM ================== */
async function sendMessage(chat_id, text) {
  if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
  return fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

/* ================== GUARDS ================== */
const seenUpdateIds = new Set();
const lastChatAt = new Map();

function isAllowedChat(chatId) {
  if (!ALLOWED_CHATS.length) return true;
  return ALLOWED_CHATS.includes(String(chatId));
}

function rateLimited(chatId) {
  const now = Date.now();
  const last = lastChatAt.get(chatId) || 0;
  if (now - last < MIN_GAP_MS) return true;
  lastChatAt.set(chatId, now);
  return false;
}

/* ================== PARSER ==================
Nhập:
- A27 60b 220k
- B24 84 140k cắt sạch
- C11 59b 180 nghỉ (note)
*/
function parseInput(textRaw) {
  const text = textRaw.trim();
  const lower = text.toLowerCase();

  // lệnh báo cáo
  if (lower.includes("tổng hôm nay")) return { cmd: "TODAY" };
  if (lower.includes("tổng cả vụ") || lower.includes("tong ca vu")) return { cmd: "ALL" };

  // bắt pattern: Vị trí + Bao + Giá + phần còn lại
  const m = text.match(/^\s*([A-Za-z]?\d{1,3})\s+(\d+)\s*(?:b|bao)?\s+(\d+)\s*(?:k)?\s*(.*)$/i);
  if (!m) return null;

  const viTri = m[1].toUpperCase();
  const dayG = Number(m[2]);
  const giaK = Number(m[3]);
  const tail = (m[4] || "").trim();

  let tinhHinh = "";
  let note = "";

  if (tail) {
    const t = tail.toLowerCase();
    if (t.includes("cắt sạch") || t.includes("cat sach")) tinhHinh = "Cắt sạch";
    else if (t.includes("nghỉ") || t.includes("nghi")) tinhHinh = "Nghỉ";
    else if (t.includes("cắt") || t.includes("cat")) tinhHinh = "Cắt";
    else note = tail;

    if (!note && tail && tinhHinh) {
      note = tail.replace(/cắt sạch|cat sach|cắt|cat|nghỉ|nghi/gi, "").trim();
    }
  }

  return { viTri, dayG, giaK, tinhHinh, note };
}

function todayKSTKey() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameKSTDate(isoTime, targetYmd) {
  const d = new Date(isoTime);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const key = `${y}-${m}-${day}`;
  return key === targetYmd;
}

/* ================== REPORTS from DATA ================== */
async function reportToday() {
  const rows = await getRows("DATA", "A2:L");
  const key = todayKSTKey();

  let totalBaoChuan = 0;
  let totalWonK = 0;
  const byViTri = new Map();

  for (const r of rows) {
    const ts = r[0];
    const viTri = r[3];
    const baoChuan = Number(r[8] || 0); // I
    const giaK = Number(r[9] || 0);     // J
    const thuLoWon = Number(r[10] || (baoChuan * giaK) || 0); // K

    if (!ts || !viTri) continue;
    if (!isSameKSTDate(ts, key)) continue;

    totalBaoChuan += baoChuan;
    totalWonK += thuLoWon;

    const cur = byViTri.get(viTri) || { bao: 0, wonK: 0 };
    cur.bao += baoChuan;
    cur.wonK += thuLoWon;
    byViTri.set(viTri, cur);
  }

  const lines = [];
  lines.push(`📊 TỔNG HÔM NAY (KST) ${key}`);
  lines.push(`• Bao chuẩn: ${totalBaoChuan}`);
  lines.push(`• Thu lợi: ${totalWonK.toLocaleString()}k`);

  const sorted = [...byViTri.entries()].sort((a, b) => b[1].wonK - a[1].wonK);
  if (sorted.length) {
    lines.push("");
    lines.push("📍 Theo bãi:");
    for (const [k, v] of sorted) lines.push(`- ${k}: ${v.bao} bao • ${v.wonK.toLocaleString()}k`);
  }

  return lines.join("\n");
}

async function reportAll() {
  const rows = await getRows("DATA", "A2:L");

  let totalBaoChuan = 0;
  let totalWonK = 0;
  const byViTri = new Map();

  for (const r of rows) {
    const viTri = r[3];
    const baoChuan = Number(r[8] || 0);
    const giaK = Number(r[9] || 0);
    const thuLoWon = Number(r[10] || (baoChuan * giaK) || 0);

    if (!viTri) continue;

    totalBaoChuan += baoChuan;
    totalWonK += thuLoWon;

    const cur = byViTri.get(viTri) || { bao: 0, wonK: 0 };
    cur.bao += baoChuan;
    cur.wonK += thuLoWon;
    byViTri.set(viTri, cur);
  }

  const lines = [];
  lines.push("📈 TỔNG CẢ VỤ");
  lines.push(`• Bao chuẩn: ${totalBaoChuan}`);
  lines.push(`• Thu lợi: ${totalWonK.toLocaleString()}k`);

  const sorted = [...byViTri.entries()].sort((a, b) => b[1].wonK - a[1].wonK);
  if (sorted.length) {
    lines.push("");
    lines.push("📍 Theo bãi:");
    for (const [k, v] of sorted) lines.push(`- ${k}: ${v.bao} bao • ${v.wonK.toLocaleString()}k`);
  }

  return lines.join("\n");
}

/* ================== WEBHOOK ================== */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body;
    const updateId = update?.update_id;

    if (updateId != null) {
      if (seenUpdateIds.has(updateId)) return;
      seenUpdateIds.add(updateId);
      if (seenUpdateIds.size > 2000) {
        const first = seenUpdateIds.values().next().value;
        seenUpdateIds.delete(first);
      }
    }

    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = msg?.text;
    const from = msg?.from;

    if (!chatId || !text) return;

    if (!isAllowedChat(chatId)) return;
    if (rateLimited(chatId)) return;

    const userName =
      [from?.first_name, from?.last_name].filter(Boolean).join(" ") ||
      from?.username ||
      "unknown";

    if (text === "/start") {
      await sendMessage(
        chatId,
        "Bot KIM 2025 OK ✅\n\n✅ Nhập: A27 60b 220k (có thể thêm 'cắt sạch' / 'nghỉ')\n📊 Lệnh: Tổng hôm nay | Tổng cả vụ"
      );
      return;
    }

    const parsed = parseInput(text);

    // báo cáo
    if (parsed?.cmd === "TODAY") {
      await sendMessage(chatId, await reportToday());
      return;
    }
    if (parsed?.cmd === "ALL") {
      await sendMessage(chatId, await reportAll());
      return;
    }

    // nhập thu hoạch
    if (!parsed) {
      await sendMessage(
        chatId,
        "Chưa đúng cú pháp.\nVí dụ: A27 60b 220k cắt sạch\nHoặc gõ: Tổng hôm nay / Tổng cả vụ"
      );
      return;
    }

    // Tạo Date theo KST (+09:00)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = kst.toISOString().slice(0, 10); // YYYY-MM-DD

    const viTri = parsed.viTri;
    const dayG = parsed.dayG;
    const maxG = dayG;         // mặc định
    const baoTau = dayG;       // mặc định
    const baoChuan = dayG;     // mặc định (sau này mình sẽ làm quy đổi theo bãi nếu bạn muốn)
    const giaK = parsed.giaK;
    const thuLoWon = baoChuan * giaK;

    const row = [
      now.toISOString(),                 // A Timestamp
      dateStr,                           // B Date
      userName,                          // C Thu
      viTri,                             // D ViTri
      dayG,                              // E DayG
      maxG,                              // F MaxG
      parsed.tinhHinh || "Cắt sạch",     // G TinhHinh
      baoTau,                            // H BaoTau
      baoChuan,                          // I BaoChuan
      giaK,                              // J GiaK
      thuLoWon,                          // K ThuLoWon
      parsed.note || ""                  // L Note
    ];

    await appendRow("DATA", row);

    await sendMessage(
      chatId,
      `✅ Đã lưu: ${viTri} • ${baoChuan} bao • ${giaK}k • ${thuLoWon.toLocaleString()}k`
    );
  } catch (e) {
    console.error("WEBHOOK ERROR:", e?.message || e);
  }
});

/* ================== START SERVER (RENDER PORT) ================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ KIM bot running on port", PORT);
});
