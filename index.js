/**
 * KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN
 * VERSION: KIM-SO-KIM-v1.1-MENU-RESET-EDIT-2025-12-15
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

console.log("🚀 RUNNING:", "KIM-SO-KIM-v1.1-MENU-RESET-EDIT-2025-12-15");

/* ================= ENV ================= */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/google-service-account.json";

const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean); // Telegram user id, not chat id

const CUT_INTERVAL_DAYS = Number(process.env.CUT_INTERVAL_DAYS || 15);

/* ================= CONFIG ================= */
// Max dây theo bãi (CHỐT)
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

/* ================= BASIC ================= */
app.get("/", (_, res) => res.send("KIM BOT OK"));
app.get("/ping", (_, res) =>
  res.json({ ok: true, version: "KIM-SO-KIM-v1.1-MENU-RESET-EDIT-2025-12-15" })
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
  // xóa sạch từ A2:L (giữ header)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A2:L",
  });
}

async function updateRow(rowNumber1Based, rowValues12) {
  // rowNumber1Based tính theo sheet (A1 là header)
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
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range,
  });
}

/* ================= TELEGRAM ================= */
async function send(chatId, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
}

async function sendMenu(chatId) {
  const reply_markup = {
    inline_keyboard: [
      [{ text: "📅 Thống kê tháng này", callback_data: "M:MONTH" }],
      [{ text: "🔁 Thống kê theo VÒNG", callback_data: "M:VONG" }],
      [{ text: "📍 Thống kê theo BÃI", callback_data: "M:BAI" }],
      [{ text: "✏️ Sửa dòng gần nhất", callback_data: "M:EDIT_HELP" }],
      [{ text: "🗑️ Xoá dòng gần nhất", callback_data: "M:DEL_LAST" }],
      [{ text: "⚠️ XOÁ SẠCH DỮ LIỆU", callback_data: "M:RESET_CONFIRM" }],
    ],
  };

  await send(
    chatId,
    "📌 MENU SỔ KIM\nChọn chức năng bên dưới:",
    { reply_markup }
  );
}

function isAdmin(fromUserId) {
  if (!ADMIN_IDS.length) return false;
  return ADMIN_IDS.includes(String(fromUserId));
}

/* ================= TIME ================= */
function kst(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000);
}

function fmtDayVN(d) {
  const days = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

function ymd(d) {
  // YYYY-MM-DD (KST date already)
  return d.toISOString().slice(0,10);
}

function moneyToTrieu(won) {
  return `${Math.round(won / 1_000_000)} triệu`;
}

/* ================= PARSE ================= */
function parseWorkLine(text) {
  const lower = text.toLowerCase().trim();

  // làm bờ / nghỉ gió (không tính ngày nghỉ)
  if (lower.includes("nghỉ gió") || lower.includes("lam bo") || lower.includes("làm bờ")) {
    return { type: "NO_WORK", tinhHinh: "Làm bờ / Nghỉ gió" };
  }

  const parts = text.trim().split(/\s+/);
  const viTri = parts[0]?.toUpperCase();
  if (!viTri || !MAX_DAY[viTri]) return null;

  let g = null, b = null, k = null, d = null;
  let note = "";

  // note: ... (nếu có)
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
  if (!g) g = MAX_DAY[viTri]; // thiếu g -> cắt sạch theo max

  return { type: "WORK", viTri, g, b, k, d, note };
}

function baoChuan(baoTau) {
  return Math.round(baoTau * BAO_RATE);
}

/* ================= CORE STATS (tính từ DATA) ================= */
function parseRowToObj(r) {
  // DATA A-L:
  // A Timestamp, B Date, C Thu, D ViTri, E DayG, F MaxG, G TinhHinh,
  // H BaoTau, I BaoChuan, J GiaK, K ThuLoWon, L Note
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

function currentMonthKeyKST() {
  const now = kst();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth()+1).padStart(2,"0");
  return `${y}-${m}`; // YYYY-MM
}

function rowMonthKey(obj) {
  // obj.date is YYYY-MM-DD
  if (!obj.date || obj.date.length < 7) return "";
  return obj.date.slice(0,7);
}

/**
 * Tính vòng theo bãi:
 * - vòng tăng khi có "cắt sạch" (dayG == maxG)
 * - các dòng "chưa sạch" thuộc vòng đang diễn ra: v+1
 * - nếu chưa có lần sạch nào -> coi là vòng 1
 */
function assignVongByBai(objs) {
  // sort by (date, ts) stable
  const sorted = [...objs].sort((a,b) => (a.date+a.ts).localeCompare(b.date+b.ts));
  const vongDone = new Map(); // bai -> count sạch đã hoàn thành
  const withVong = [];

  for (const o of sorted) {
    if (!o.bai) { withVong.push({ ...o, vong: 0 }); continue; }

    const done = vongDone.get(o.bai) || 0;
    const isClean = o.maxG > 0 && o.dayG === o.maxG;

    let vong;
    if (isClean) {
      vong = done + 1;
      vongDone.set(o.bai, done + 1);
    } else {
      vong = Math.max(1, done + 1);
    }

    withVong.push({ ...o, vong, isClean });
  }
  return withVong;
}

function nextCutForecast(lastCleanYmd) {
  if (!lastCleanYmd) return "";
  const d = new Date(lastCleanYmd + "T00:00:00");
  const next = new Date(d.getTime() + CUT_INTERVAL_DAYS * 86400000);
  const dd = String(next.getDate()).padStart(2,"0");
  const mm = String(next.getMonth()+1).padStart(2,"0");
  const yyyy = next.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* ================= FIND / EDIT / DELETE ================= */
async function findLastWorkRowIndexForUser(rows, userName, viTri) {
  // returns sheet row number (1-based), where DATA row starts at 2
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.thu === userName && o.bai === viTri && o.won >= 0) {
      return 2 + i;
    }
  }
  return null;
}

async function findLastRowIndexAny(rows) {
  // last non-empty row
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.ts || o.date || o.thu || o.bai || o.tinhHinh) return 2 + i;
  }
  return null;
}

/* ================= OUTPUT TEMPLATE ================= */
async function sendSoKim(chatId, userName, objForThisCmd, totalToNowWon, vongForThisCmd, forecast) {
  const dateObj = new Date(objForThisCmd.date + "T00:00:00");
  const isClean = objForThisCmd.dayG === objForThisCmd.maxG && objForThisCmd.maxG > 0;

  const tinhText =
    objForThisCmd.tinhHinh && objForThisCmd.tinhHinh !== "Cắt sạch" && objForThisCmd.tinhHinh !== "Chưa sạch"
      ? objForThisCmd.tinhHinh
      : (isClean ? "Cắt sạch" : "Chưa sạch");

  const text =
`--- 🌊 SỔ KIM (Vòng: ${vongForThisCmd}) ---
Chào Minh Kính, đây là kết quả của lệnh bạn gửi

📅 Ngày: ${fmtDayVN(dateObj)}
📍 Vị trí: ${objForThisCmd.bai}
✂️ Tình hình: ${tinhText} (${objForThisCmd.dayG}/${objForThisCmd.maxG} dây)
📦 Sản lượng: ${objForThisCmd.baoTau} bao lớn (≈ ${objForThisCmd.baoChuan} bao tính tiền)
💰 Giá: ${objForThisCmd.giaK}k

💵 THU HÔM NAY: ${objForThisCmd.won.toLocaleString()} ₩
🏆 TỔNG THU TỚI THỜI ĐIỂM NÀY: ${moneyToTrieu(totalToNowWon)} ₩
----------------------------------
${forecast ? `(Dự báo nhanh: Bãi này sẽ cắt lại vào ${forecast})` : ""}`.trim();

  await send(chatId, text);
}

/* ================= MENU ACTIONS ================= */
async function reportMonth(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const monthKey = currentMonthKeyKST();

  // ngày làm = số ngày có doanh thu > 0
  const workDays = new Set();
  let windDays = new Set();
  let shoreDays = new Set();
  let totalWon = 0;

  for (const o of objs) {
    if (rowMonthKey(o) !== monthKey) continue;
    if (o.won > 0) {
      workDays.add(o.date);
      totalWon += o.won;
    } else {
      // phân loại theo tình hình
      const t = (o.tinhHinh || "").toLowerCase();
      if (t.includes("nghỉ gió")) windDays.add(o.date || "(không ngày)");
      if (t.includes("làm bờ") || t.includes("lam bo")) shoreDays.add(o.date || "(không ngày)");
    }
  }

  const text =
`📅 THỐNG KÊ THÁNG ${monthKey}
• Số ngày làm: ${workDays.size}
• Nghỉ gió: ${windDays.size} ngày
• Làm bờ: ${shoreDays.size} ngày
• Tổng doanh thu tháng: ${totalWon.toLocaleString()} ₩`;

  await send(chatId, text);
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
    if (o.maxG > 0 && o.dayG === o.maxG) cur.lastCleanDate = o.date || cur.lastCleanDate;
    map.set(o.bai, cur);
  }

  const items = [...map.entries()].sort((a,b) => (b[1].won||0) - (a[1].won||0));

  let out = "📍 THỐNG KÊ THEO BÃI (tổng từ DATA)\n";
  for (const [bai, v] of items) {
    const forecast = nextCutForecast(v.lastCleanDate);
    out += `\n• ${bai}: ${v.baoTau} bao | ≈ ${v.baoChuan} chuẩn | ${v.won.toLocaleString()} ₩`;
    if (forecast) out += `\n  ⤷ Dự báo cắt lại: ${forecast}`;
  }

  await send(chatId, out.trim());
}

async function reportByVong(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const withV = assignVongByBai(objs);

  // gộp doanh thu theo vòng (toàn bộ bãi)
  const sumByV = new Map(); // vong -> won
  const byBaiV = new Map(); // key bai|vong -> won

  for (const o of withV) {
    if (!o.bai || o.vong <= 0) continue;
    const cur = sumByV.get(o.vong) || 0;
    sumByV.set(o.vong, cur + (o.won || 0));

    const key = `${o.bai}|${o.vong}`;
    const cur2 = byBaiV.get(key) || 0;
    byBaiV.set(key, cur2 + (o.won || 0));
  }

  const vongs = [...sumByV.entries()].sort((a,b)=>a[0]-b[0]).slice(0, 10);

  let out = "🔁 THỐNG KÊ THEO VÒNG (tính từ DATA)\n";
  for (const [v, won] of vongs) out += `\n• Vòng ${v}: ${won.toLocaleString()} ₩`;

  out += "\n\nTheo từng bãi (top):";
  const top = [...byBaiV.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 12);
  for (const [k, won] of top) {
    const [bai, v] = k.split("|");
    out += `\n- ${bai} • Vòng ${v}: ${won.toLocaleString()} ₩`;
  }

  await send(chatId, out.trim());
}

/* ================= MAIN HANDLER ================= */
async function handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "Bạn";
  const fromUserId = msg.from?.id;

  const textRaw = (msg.text || "").trim();

  // menu
  if (textRaw.toLowerCase() === "menu" || textRaw === "/menu") {
    await sendMenu(chatId);
    return;
  }

  // admin commands text (fallback, ngoài menu)
  if (textRaw === "/reset") {
    if (!isAdmin(fromUserId)) {
      await send(chatId, "❌ Bạn không có quyền dùng lệnh này.");
      return;
    }
    await send(chatId, "⚠️ Xác nhận xoá sạch: gõ đúng `XOA SACH`", { parse_mode: "Markdown" });
    return;
  }

  if (textRaw === "XOA SACH") {
    if (!isAdmin(fromUserId)) {
      await send(chatId, "❌ Bạn không có quyền.");
      return;
    }
    await clearAllData();
    await send(chatId, "✅ Đã xoá sạch DATA (giữ header). Giờ bạn có thể làm lại từ đầu.");
    return;
  }

  // sửa: "sua <cú pháp mới>"
  if (textRaw.toLowerCase().startsWith("sua ")) {
    const newLine = textRaw.slice(4).trim();
    const parsed = parseWorkLine(newLine);
    if (!parsed || parsed.type !== "WORK") {
      await send(chatId, "❌ Nhập sai rồi bạn iu ơi 😅\nVí dụ:\nA27 60b 220k\nA27 30g 40b 220k\nA27 80b 120k 5d");
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

    // giữ timestamp cũ bằng cách lấy từ dòng cũ
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

  // ====== nghiệp vụ chính: 1 dòng nhập ======
  const parsed = parseWorkLine(textRaw);

  // sai cú pháp -> 1 câu duy nhất
  if (!parsed) {
    await send(
      chatId,
      "❌ Nhập sai rồi bạn iu ơi 😅\nVí dụ:\nA27 60b 220k\nA27 30g 40b 220k\nA27 80b 120k 5d"
    );
    return;
  }

  // làm bờ / nghỉ gió (không tính ngày nghỉ)
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
    // đúng yêu cầu: không cần trả OK/test; lệnh này coi như ghi nhận yên lặng
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

  // total tới thời điểm này + vòng theo bãi (tính từ DATA)
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const totalBefore = objs.reduce((s,o)=>s+(o.won||0),0);

  const isClean = parsed.g === MAX_DAY[parsed.viTri];
  const vongDone = objs.filter(o => o.bai === parsed.viTri && o.maxG > 0 && o.dayG === o.maxG).length;
  const vongThis = isClean ? (vongDone + 1) : Math.max(1, vongDone + 1);

  const totalToNow = totalBefore + money;

  // ghi DATA
  const tinhHinh = isClean ? "Cắt sạch" : "Chưa sạch";
  const row = [
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
  ];
  await appendRow(row);

  // dự báo cắt lại (dựa trên lần cắt sạch gần nhất)
  let lastClean = "";
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.bai === parsed.viTri && o.maxG > 0 && o.dayG === o.maxG) { lastClean = o.date; break; }
  }
  // nếu lần này vừa sạch thì dùng ngày hiện tại làm mốc
  const forecast = nextCutForecast(isClean ? ymd(workDate) : lastClean);

  const objForThis = {
    date: ymd(workDate),
    bai: parsed.viTri,
    dayG: parsed.g,
    maxG: MAX_DAY[parsed.viTri],
    tinhHinh,
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
  const fromUserId = cb.from?.id;
  const data = cb.data || "";

  // trả lời callback để Telegram khỏi loading
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cb.id }),
  });

  if (!chatId) return;

  if (data === "M:MONTH") return reportMonth(chatId);
  if (data === "M:VONG") return reportByVong(chatId);
  if (data === "M:BAI") return reportByBai(chatId);

  if (data === "M:EDIT_HELP") {
    await send(chatId,
`✏️ SỬA DÒNG GẦN NHẤT
Bạn gõ:  sua <cú pháp mới>
Ví dụ:  sua A27 60b 200k
Ví dụ:  sua A27 30g 40b 220k
(Chỉ sửa dòng gần nhất của BÃI đó do bạn nhập)`);
    return;
  }

  if (data === "M:DEL_LAST") {
    if (!isAdmin(fromUserId)) {
      await send(chatId, "❌ Bạn không có quyền xoá.");
      return;
    }
    const rows = await getRows();
    const idx = await findLastRowIndexAny(rows);
    if (!idx) {
      await send(chatId, "Không có dữ liệu để xoá.");
      return;
    }
    await clearRow(idx);
    await send(chatId, `✅ Đã xoá dòng gần nhất (row ${idx}).`);
    return;
  }

  if (data === "M:RESET_CONFIRM") {
    if (!isAdmin(fromUserId)) {
      await send(chatId, "❌ Bạn không có quyền dùng chức năng này.");
      return;
    }
    const reply_markup = {
      inline_keyboard: [
        [{ text: "✅ XÁC NHẬN XOÁ SẠCH", callback_data: "M:RESET_DO" }],
        [{ text: "❎ HUỶ", callback_data: "M:RESET_CANCEL" }],
      ],
    };
    await send(chatId, "⚠️ Bạn chắc chắn muốn XOÁ SẠCH DATA (giữ header)?", { reply_markup });
    return;
  }

  if (data === "M:RESET_DO") {
    if (!isAdmin(fromUserId)) {
      await send(chatId, "❌ Bạn không có quyền.");
      return;
    }
    await clearAllData();
    await send(chatId, "✅ Đã XOÁ SẠCH toàn bộ DATA (giữ header). Bạn có thể làm lại từ đầu.");
    return;
  }

  if (data === "M:RESET_CANCEL") {
    await send(chatId, "Đã huỷ xoá sạch.");
    return;
  }
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;

    if (body?.callback_query) {
      await handleCallbackQuery(body.callback_query);
      return;
    }

    if (body?.message) {
      await handleTextMessage(body.message);
      return;
    }
  } catch (e) {
    console.error("WEBHOOK ERROR:", e?.message || e);
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("✅ KIM BOT READY on", PORT));
