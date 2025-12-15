/**
 * KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN
 * VERSION: KIM-SO-KIM-v1.4-ONEFILE-MENU-BUTTON-2525-FORMAT-2025-12-15
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

console.log("🚀 RUNNING:", "KIM-SO-KIM-v1.4-ONEFILE-MENU-BUTTON-2525-FORMAT-2025-12-15");

/* ================= ENV ================= */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/google-service-account.json";

const CUT_INTERVAL_DAYS = Number(process.env.CUT_INTERVAL_DAYS || 15);

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
const CONFIRM_DELETE_CODE = "2525";

const MENU_TEXT = "📌 MENU";

/* ================= BASIC ================= */
app.get("/", (_, res) => res.send("KIM BOT OK"));
app.get("/ping", (_, res) =>
  res.json({ ok: true, version: "KIM-SO-KIM-v1.4-ONEFILE-MENU-BUTTON-2525-FORMAT-2025-12-15" })
);

/* ================= SHEET ================= */
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

async function updateRow(rowNumber1Based, rowValues12) {
  const range = `DATA!A${rowNumber1Based}:L${rowNumber1Based}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowValues12] },
  });
}

async function clearRow(rowNumber1Based) {
  const range = `DATA!A${rowNumber1Based}:L${rowNumber1Based}`;
  await sheets.spreadsheets.values.clear({ spreadsheetId: GOOGLE_SHEET_ID, range });
}

/* ================= TELEGRAM ================= */
async function send(chatId, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
}

async function answerCallbackQuery(cbId) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cbId }),
  });
}

/**
 * ✅ Nút MENU luôn hiện (reply keyboard)
 * - Nhưng danh sách chức năng chỉ hiện khi user bấm "📌 MENU"
 */
async function ensureMenuButton(chatId) {
  const reply_markup = {
    keyboard: [[{ text: MENU_TEXT }]],
    resize_keyboard: true,
    one_time_keyboard: false,
    selective: false,
  };
  await send(chatId, "✅ Sổ Kim đã sẵn sàng. Bấm 📌 MENU để dùng chức năng.", { reply_markup });
}

/**
 * ✅ Inline menu (tất cả chức năng trong 1 lần bấm)
 * Chỉ hiện khi user bấm "📌 MENU"
 */
async function showInlineMenu(chatId) {
  const reply_markup = {
    inline_keyboard: [
      [{ text: "📅 Thống kê tháng", callback_data: "M:MONTH" }],
      [{ text: "🔁 Thống kê theo VÒNG", callback_data: "M:VONG" }],
      [{ text: "📍 Thống kê theo BÃI", callback_data: "M:BAI" }],
      [{ text: "✏️ Hướng dẫn sửa", callback_data: "M:EDIT_HELP" }],
      [{ text: "🗑️ Xoá dòng gần nhất", callback_data: "M:DEL_LAST" }],
      [{ text: "⚠️ XOÁ SẠCH DỮ LIỆU", callback_data: "M:RESET_ALL" }],
    ],
  };

  await send(chatId, "📌 MENU SỔ KIM\nChọn chức năng:", { reply_markup });
}

/* ================= TIME ================= */
function kst(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000);
}

function ymd(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function fmtDayVN(d) {
  const days = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

function ddmmyyyy(d) {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function moneyToTrieu(won) {
  return `${Math.round(won / 1_000_000)} triệu`;
}

/* ================= PARSE ================= */
function parseWorkLine(text) {
  const lower = text.toLowerCase().trim();

  // làm bờ / nghỉ gió
  if (lower.includes("nghỉ gió") || lower.includes("lam bo") || lower.includes("làm bờ")) {
    return { type: "NO_WORK", tinhHinh: "Làm bờ / Nghỉ gió" };
  }

  const parts = text.trim().split(/\s+/);
  const viTri = parts[0]?.toUpperCase();
  if (!viTri || !MAX_DAY[viTri]) return null;

  let g = null, b = null, k = null, d = null;
  let note = "";

  const noteIdx = parts.findIndex(p => p.toLowerCase().startsWith("note:"));
  if (noteIdx >= 0) {
    note = parts.slice(noteIdx).join(" ").replace(/^note:\s*/i, "").trim();
  }

  for (const p of parts) {
    if (/^\d+g$/i.test(p)) g = +p.slice(0,-1);
    if (/^\d+b$/i.test(p)) b = +p.slice(0,-1);
    if (/^\d+k$/i.test(p)) k = +p.slice(0,-1);
    if (/^\d+d$/i.test(p)) d = +p.slice(0,-1);
  }

  if (!b || !k) return null;
  if (!g) g = MAX_DAY[viTri];

  return { type: "WORK", viTri, g, b, k, d, note };
}

function baoChuan(baoTau) {
  return Math.round(baoTau * BAO_RATE);
}

/* ================= CORE STATS (từ DATA) ================= */
function parseRowToObj(r) {
  // A Timestamp, B Date, C Thu, D ViTri, E DayG, F MaxG, G TinhHinh,
  // H BaoTau, I BaoChuan, J GiaK, K Won, L Note
  return {
    ts: r[0] || "",
    date: r[1] || "",
    thu: r[2] || "",
    bai: r[3] || "",
    dayG: Number(r[4] || 0),
    maxG: Number(r[5] || 0),
    tinhHinh: r[6] || "",
    baoTau: Number(r[7] || 0),
    baoChuan: Number(r[8] || 0),
    giaK: Number(r[9] || 0),
    won: Number(r[10] || 0),
    note: r[11] || "",
  };
}

function isCleanRow(o) {
  return o.maxG > 0 && o.dayG === o.maxG;
}

function nextCutForecast(lastCleanYmd) {
  if (!lastCleanYmd) return "";
  const d = new Date(lastCleanYmd + "T00:00:00");
  const next = new Date(d.getTime() + CUT_INTERVAL_DAYS * 86400000);
  return ddmmyyyy(next);
}

/* ================= FIND / EDIT / DELETE ================= */
async function findLastWorkRowIndexForUser(rows, userName, viTri) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.thu === userName && o.bai === viTri) return 2 + i;
  }
  return null;
}

async function findLastRowIndexAny(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.ts || o.date || o.thu || o.bai || o.tinhHinh) return 2 + i;
  }
  return null;
}

/* ================= OUTPUT (FORMAT CHỐT) ================= */
const INVALID_TEXT =
`❌ Nhập sai rồi bạn iu ơi 😅
Ví dụ:
A27 60b 220k
A27 30g 40b 220k
A27 80b 120k 5d`;

async function sendSoKim(chatId, userName, objForThisCmd, totalToNowWon, vongForThisCmd, forecast) {
  const dateObj = new Date(objForThisCmd.date + "T00:00:00");
  const isClean = objForThisCmd.dayG === objForThisCmd.maxG && objForThisCmd.maxG > 0;

  const text =
`--- 🌊 SỔ KIM (Vòng: ${vongForThisCmd}) ---
Chào ${userName}, đây là kết quả của lệnh bạn gửi

📅 Ngày: ${fmtDayVN(dateObj)}
📍 Vị trí: ${objForThisCmd.bai}
✂️ Tình hình: ${isClean ? "Cắt sạch" : "Chưa sạch"} (${objForThisCmd.dayG}/${objForThisCmd.maxG} dây)
📦 Sản lượng: ${objForThisCmd.baoTau} bao lớn (≈ ${objForThisCmd.baoChuan} bao tính tiền)
💰 Giá: ${objForThisCmd.giaK}k

💵 THU HÔM NAY: ${objForThisCmd.won.toLocaleString()} ₩
🏆 TỔNG THU TỚI THỜI ĐIỂM NÀY: ${moneyToTrieu(totalToNowWon)} ₩
----------------------------------
${forecast ? `(Dự báo nhanh: Bãi này sẽ cắt lại vào ${forecast})` : ""}`.trim();

  await send(chatId, text);
}

/* ================= REPORTS (chỉ khi bấm MENU) ================= */
function monthKeyKST() {
  const now = kst();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}`;
}

async function reportMonth(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const ym = monthKeyKST();

  let totalWon = 0;
  const anyDays = new Set();
  const workDays = new Set();
  const windDays = new Set();
  const shoreDays = new Set();

  for (const o of objs) {
    if (!o.date || !o.date.startsWith(ym)) continue;

    anyDays.add(o.date);

    if (o.won > 0) {
      workDays.add(o.date);
      totalWon += o.won;
    } else {
      const t = (o.tinhHinh || "").toLowerCase();
      if (t.includes("nghỉ gió")) windDays.add(o.date);
      if (t.includes("làm bờ") || t.includes("lam bo")) shoreDays.add(o.date);
    }
  }

  // Ngày nghỉ: từ ngày 1 đến hôm nay, ngày nào không có record nào => nghỉ
  const now = kst();
  const today = now.getDate();
  const allDays = new Set();
  for (let i = 1; i <= today; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), i);
    allDays.add(ymd(kst(d))); // đảm bảo kst
  }
  const nghi = [...allDays].filter(d => !anyDays.has(d)).length;

  const text =
`📅 THỐNG KÊ THÁNG ${ym}
• Số ngày làm: ${workDays.size}
• Nghỉ gió: ${windDays.size} ngày
• Làm bờ: ${shoreDays.size} ngày
• Ngày nghỉ: ${nghi} ngày
• Tổng doanh thu tháng: ${totalWon.toLocaleString()} ₩`;

  await send(chatId, text);
}

async function reportByVong(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);

  // Vòng TOÀN CỤC = thứ tự của các dòng CẮT SẠCH (mọi bãi)
  const cleanRows = objs
    .filter(isCleanRow)
    .sort((a,b)=> (a.date+a.ts).localeCompare(b.date+b.ts));

  const sumByV = new Map(); // vong -> won
  cleanRows.forEach((o, idx) => {
    const v = idx + 1;
    sumByV.set(v, (sumByV.get(v) || 0) + (o.won || 0));
  });

  let out = "🔁 THỐNG KÊ THEO VÒNG\n";
  if (!cleanRows.length) {
    out += "\n(Chưa có lượt cắt sạch nào)";
    await send(chatId, out.trim());
    return;
  }

  for (const [v, won] of [...sumByV.entries()].sort((a,b)=>a[0]-b[0])) {
    out += `\n• Vòng ${v}: ${won.toLocaleString()} ₩`;
  }

  await send(chatId, out.trim());
}

async function reportByBai(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);

  const map = new Map(); // bai -> {baoTau, baoChuan, won, lastCleanDate}
  for (const o of objs) {
    if (!o.bai) continue;
    const cur = map.get(o.bai) || { baoTau: 0, baoChuan: 0, won: 0, lastCleanDate: "" };
    cur.baoTau += o.baoTau || 0;
    cur.baoChuan += o.baoChuan || 0;
    cur.won += o.won || 0;
    if (isCleanRow(o)) cur.lastCleanDate = o.date || cur.lastCleanDate;
    map.set(o.bai, cur);
  }

  const items = [...map.entries()].sort((a,b) => (b[1].won||0) - (a[1].won||0));

  let out = "📍 THỐNG KÊ THEO BÃI\n";
  if (!items.length) {
    out += "\n(Chưa có dữ liệu)";
    await send(chatId, out.trim());
    return;
  }

  for (const [bai, v] of items) {
    const forecast = nextCutForecast(v.lastCleanDate);
    out += `\n• ${bai}: ${v.baoTau} bao | ≈ ${v.baoChuan} chuẩn | ${v.won.toLocaleString()} ₩`;
    if (forecast) out += `\n  ⤷ Dự báo cắt lại: ${forecast}`;
  }

  await send(chatId, out.trim());
}

/* ================= DELETE CONFIRM (chỉ 2525) ================= */
const PENDING_ACTION = new Map(); // chatId -> "DEL_LAST" | "RESET_ALL"

/* ================= MAIN HANDLER ================= */
async function handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "Bạn";
  const textRaw = (msg.text || "").trim();

  // 1) /start => chỉ đưa nút MENU (không bung chức năng)
  if (textRaw === "/start") {
    await ensureMenuButton(chatId);
    return;
  }

  // 2) bấm nút MENU => bung tất cả chức năng
  if (textRaw === MENU_TEXT) {
    await showInlineMenu(chatId);
    return;
  }

  // 3) xác nhận xoá = chỉ cần nhập 2525
  const pending = PENDING_ACTION.get(chatId);
  if (pending && textRaw === CONFIRM_DELETE_CODE) {
    if (pending === "DEL_LAST") {
      const rows = await getRows();
      const idx = await findLastRowIndexAny(rows);
      if (!idx) {
        await send(chatId, "Không có dữ liệu để xoá.");
      } else {
        await clearRow(idx);
        await send(chatId, "✅ Đã xoá dòng gần nhất.");
      }
    }

    if (pending === "RESET_ALL") {
      await clearAllData();
      await send(chatId, "🧹 Đã xoá sạch DATA (giữ header).");
    }

    PENDING_ACTION.delete(chatId);
    return;
  }

  // 4) sửa: "sua <cú pháp mới>"
  if (textRaw.toLowerCase().startsWith("sua ")) {
    const newLine = textRaw.slice(4).trim();
    const parsed = parseWorkLine(newLine);
    if (!parsed || parsed.type !== "WORK") {
      await send(chatId, INVALID_TEXT);
      return;
    }

    const rows = await getRows();
    const rowIdx = await findLastWorkRowIndexForUser(rows, userName, parsed.viTri);
    if (!rowIdx) {
      await send(chatId, "❌ Không tìm thấy dòng gần nhất để sửa cho bãi này.");
      return;
    }

    const nowKST = kst();
    const workDate = parsed.d
      ? new Date(nowKST.getFullYear(), nowKST.getMonth(), parsed.d)
      : new Date(nowKST.getTime() - 86400000);

    const bc = baoChuan(parsed.b);
    const money = bc * parsed.k * 1000;
    const tinhHinh = parsed.g === MAX_DAY[parsed.viTri] ? "Cắt sạch" : "Chưa sạch";

    const oldObj = parseRowToObj(rows[rowIdx - 2]);
    const newRow = [
      oldObj.ts || new Date().toISOString(),
      ymd(workDate),
      userName,
      parsed.viTri,
      parsed.g,
      MAX_DAY[parsed.viTri],
      tinhHinh,
      parsed.b,
      bc,
      parsed.k,
      money,
      parsed.note || oldObj.note || "",
    ];

    await updateRow(rowIdx, newRow);
    await send(chatId, `✅ Đã sửa dòng gần nhất của ${parsed.viTri}.`);
    return;
  }

  // 5) nghiệp vụ chính
  const parsed = parseWorkLine(textRaw);

  if (!parsed) {
    await send(chatId, INVALID_TEXT);
    return;
  }

  // làm bờ / nghỉ gió (ghi nhận)
  if (parsed.type === "NO_WORK") {
    const d = kst();
    await appendRow([
      new Date().toISOString(),
      ymd(d),
      userName,
      "",
      0,
      0,
      parsed.tinhHinh,
      0,
      0,
      0,
      0,
      "",
    ]);
    await send(chatId, "✅ Đã ghi: Làm bờ / Nghỉ gió.");
    return;
  }

  // WORK
  const nowKST = kst();
  const workDate = parsed.d
    ? new Date(nowKST.getFullYear(), nowKST.getMonth(), parsed.d)
    : new Date(nowKST.getTime() - 86400000); // mặc định hôm qua

  const bc = baoChuan(parsed.b);
  const money = bc * parsed.k * 1000;

  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const totalBefore = objs.reduce((s,o)=>s+(o.won||0),0);

  // VÒNG TOÀN CỤC: đếm tất cả lượt cắt sạch trước đó
  const globalCleanCountBefore = objs.filter(isCleanRow).length;

  const isClean = parsed.g === MAX_DAY[parsed.viTri];
  // vòng hiện tại: nếu đang “chưa sạch” vẫn thuộc vòng đang diễn ra => +1
  // nếu “cắt sạch” thì cũng trả vòng đó (vì chính lệnh này là lượt cắt sạch tiếp theo)
  const vongThis = globalCleanCountBefore + 1;

  const totalToNow = totalBefore + money;

  const tinhHinh = isClean ? "Cắt sạch" : "Chưa sạch";

  await appendRow([
    new Date().toISOString(),
    ymd(workDate),
    userName,
    parsed.viTri,
    parsed.g,
    MAX_DAY[parsed.viTri],
    tinhHinh,
    parsed.b,
    bc,
    parsed.k,
    money,
    parsed.note || "",
  ]);

  // dự báo cắt lại
  let lastClean = "";
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.bai === parsed.viTri && isCleanRow(o)) { lastClean = o.date; break; }
  }
  const forecast = nextCutForecast(isClean ? ymd(workDate) : lastClean);

  const objForThis = {
    date: ymd(workDate),
    bai: parsed.viTri,
    dayG: parsed.g,
    maxG: MAX_DAY[parsed.viTri],
    baoTau: parsed.b,
    baoChuan: bc,
    giaK: parsed.k,
    won: money,
  };

  await sendSoKim(chatId, userName, objForThis, totalToNow, vongThis, forecast);
}

/* ================= CALLBACK MENU ================= */
async function handleCallbackQuery(cb) {
  const chatId = cb.message?.chat?.id;
  const data = cb.data || "";

  await answerCallbackQuery(cb.id);
  if (!chatId) return;

  if (data === "M:MONTH") return reportMonth(chatId);
  if (data === "M:VONG") return reportByVong(chatId);
  if (data === "M:BAI") return reportByBai(chatId);

  if (data === "M:EDIT_HELP") {
    await send(chatId,
`✏️ SỬA DÒNG GẦN NHẤT
Bạn gõ:
sua A27 60b 220k
sua A27 30g 40b 220k
sua A27 80b 120k 5d`);
    return;
  }

  if (data === "M:DEL_LAST") {
    PENDING_ACTION.set(chatId, "DEL_LAST");
    await send(chatId, "⚠️ Nhập 2525 để xác nhận xoá dòng gần nhất.");
    return;
  }

  if (data === "M:RESET_ALL") {
    PENDING_ACTION.set(chatId, "RESET_ALL");
    await send(chatId, "⚠️ Nhập 2525 để xác nhận xoá sạch dữ liệu.");
    return;
  }
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body?.callback_query) return await handleCallbackQuery(body.callback_query);
    if (body?.message) return await handleTextMessage(body.message);
  } catch (e) {
    console.error("WEBHOOK ERROR:", e?.message || e);
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("✅ KIM BOT READY on", PORT));
