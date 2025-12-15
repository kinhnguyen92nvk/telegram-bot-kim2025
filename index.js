/**
 * KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN
 * VERSION: KIM-SO-KIM-v1.2-REPLYMENU-2525-VONGFIX-2025-12-15
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

const VERSION = "KIM-SO-KIM-v1.2-REPLYMENU-2525-VONGFIX-2025-12-15";
console.log("🚀 RUNNING:", VERSION);

/* ================= ENV ================= */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/google-service-account.json";

const CUT_INTERVAL_DAYS = Number(process.env.CUT_INTERVAL_DAYS || 15);
const BAO_RATE = 1.4;
const DELETE_PIN = String(process.env.DELETE_PIN || "2525"); // mã xác nhận xoá

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

/* ================= BASIC ================= */
app.get("/", (_, res) => res.send("KIM BOT OK"));
app.get("/ping", (_, res) => res.json({ ok: true, version: VERSION }));

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

/**
 * MENU chính nằm dưới ô nhập (Reply Keyboard)
 * -> không cần gõ chữ menu
 */
const MENU = {
  MONTH: "📅 Thống kê tháng này",
  VONG: "🔁 Thống kê theo VÒNG",
  BAI: "📍 Thống kê theo BÃI",
  LAST: "🧾 Xem dòng gần nhất",
  EDIT: "✏️ Sửa dòng gần nhất",
  DEL: "🗑️ Xoá dòng gần nhất",
  RESET: "⚠️ XOÁ SẠCH DỮ LIỆU",
  HELP: "❓ Hướng dẫn",
};

async function setReplyMenu(chatId) {
  const reply_markup = {
    keyboard: [
      [MENU.MONTH, MENU.VONG],
      [MENU.BAI, MENU.LAST],
      [MENU.EDIT, MENU.DEL],
      [MENU.RESET, MENU.HELP],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    selective: false,
  };
  await send(chatId, "📌 MENU SỔ KIM (bấm nút để chạy):", { reply_markup });
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
  return d.toISOString().slice(0,10);
}

function moneyToTrieu(won) {
  return `${Math.round(won / 1_000_000)} triệu`;
}

function baoChuan(baoTau) {
  return Math.round(baoTau * BAO_RATE);
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

/* ================= DATA PARSE ================= */
function parseRowToObj(r) {
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
  return `${y}-${m}`;
}
function rowMonthKey(obj) {
  if (!obj.date || obj.date.length < 7) return "";
  return obj.date.slice(0,7);
}

/* ================= PARSE INPUT ================= */
function parseWorkLine(text) {
  const lower = text.toLowerCase().trim();

  // làm bờ / nghỉ gió
  if (lower.includes("nghỉ gió") || lower.includes("lam bo") || lower.includes("làm bờ")) {
    return { type: "NO_WORK", tinhHinh: lower.includes("nghỉ gió") ? "Nghỉ gió" : "Làm bờ" };
  }

  const parts = text.trim().split(/\s+/);
  const viTri = parts[0]?.toUpperCase();
  if (!viTri || !MAX_DAY[viTri]) return null;

  let g = null, b = null, k = null, d = null;
  let note = "";

  const noteIdx = parts.findIndex(p => p.toLowerCase().startsWith("note:"));
  if (noteIdx >= 0) note = parts.slice(noteIdx).join(" ").replace(/^note:\s*/i, "").trim();

  for (const p of parts) {
    if (/^\d+g$/i.test(p)) g = +p.slice(0,-1);
    if (/^\d+b$/i.test(p)) b = +p.slice(0,-1);
    if (/^\d+k$/i.test(p)) k = +p.slice(0,-1);
    if (/^\d+d$/i.test(p)) d = +p.slice(0,-1);
  }

  if (!b || !k) return null;
  if (!g) g = MAX_DAY[viTri]; // thiếu g -> cắt sạch
  return { type: "WORK", viTri, g, b, k, d, note };
}

/* ================= VÒNG LOGIC (FIX THEO YÊU CẦU) =================
- Vòng của từng bãi: tăng khi có cắt sạch (dayG==maxG)
- Thống kê theo VÒNG (toàn bộ): lấy TẤT CẢ các dòng CẮT SẠCH của mọi bãi, nhóm theo (vòng của bãi đó) rồi cộng lại
- Thống kê theo BÃI: hiện vòng 1/2/3... của riêng bãi đó và tổng
*/
function assignVongPerBai(objs) {
  const sorted = [...objs].sort((a,b) => (a.date+a.ts).localeCompare(b.date+b.ts));
  const done = new Map(); // bai -> số vòng đã cắt sạch
  return sorted.map(o => {
    if (!o.bai) return { ...o, vong: 0, isClean: false };
    const isClean = o.maxG > 0 && o.dayG === o.maxG;
    const d = done.get(o.bai) || 0;
    const vong = isClean ? d + 1 : Math.max(1, d + 1);
    if (isClean) done.set(o.bai, d + 1);
    return { ...o, vong, isClean };
  });
}

/* ================= FIND ROWS ================= */
async function findLastRowIndexAny(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.ts || o.date || o.thu || o.bai || o.tinhHinh) return 2 + i;
  }
  return null;
}

async function findLastWorkRowIndexForUser(rows, userName, viTri) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.thu === userName && o.bai === viTri && o.won >= 0) return 2 + i;
  }
  return null;
}

async function getLastRow(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.ts || o.date || o.thu || o.bai || o.tinhHinh) return { idx: 2 + i, obj: o };
  }
  return null;
}

/* ================= OUTPUT TEMPLATE (CHUẨN MẪU) ================= */
async function sendSoKim(chatId, userName, objForCmd, totalToNowWon, vongForCmd, forecast) {
  const dateObj = new Date(objForCmd.date + "T00:00:00");
  const isClean = objForCmd.maxG > 0 && objForCmd.dayG === objForCmd.maxG;
  const tinhText = isClean ? "Cắt sạch" : "Chưa sạch";

  const text =
`--- 🌊 SỔ KIM (Vòng: ${vongForCmd}) ---
Chào ${userName}, đây là kết quả của lệnh bạn gửi

📅 Ngày: ${fmtDayVN(dateObj)}
📍 Vị trí: ${objForCmd.bai}
✂️ Tình hình: ${tinhText} (${objForCmd.dayG}/${objForCmd.maxG} dây)
📦 Sản lượng: ${objForCmd.baoTau} bao lớn (≈ ${objForCmd.baoChuan} bao tính tiền)
💰 Giá: ${objForCmd.giaK}k

💵 THU HÔM NAY: ${objForCmd.won.toLocaleString()} ₩
🏆 TỔNG THU TỚI THỜI ĐIỂM NÀY: ${moneyToTrieu(totalToNowWon)} ₩
----------------------------------
${forecast ? `(Dự báo nhanh: Bãi này sẽ cắt lại vào ${forecast})` : ""}`.trim();

  await send(chatId, text);
}

const SYNTAX_ERROR =
`❌ Nhập sai rồi bạn iu ơi 😅
Ví dụ:
A27 60b 220k
A27 30g 40b 220k
A27 80b 120k 5d`;

/* ================= REPORTS ================= */
async function reportMonth(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const monthKey = currentMonthKeyKST();

  const workDays = new Set();
  const windDays = new Set();
  const shoreDays = new Set();
  let totalWon = 0;

  for (const o of objs) {
    if (rowMonthKey(o) !== monthKey) continue;

    if (o.won > 0) {
      workDays.add(o.date);
      totalWon += o.won;
    } else {
      const t = (o.tinhHinh || "").toLowerCase();
      if (t.includes("nghỉ gió")) windDays.add(o.date);
      if (t.includes("làm bờ") || t.includes("lam bo")) shoreDays.add(o.date);
    }
  }

  await send(chatId,
`📅 THỐNG KÊ THÁNG ${monthKey}
• Số ngày làm: ${workDays.size}
• Nghỉ gió: ${windDays.size} ngày
• Làm bờ: ${shoreDays.size} ngày
• Tổng doanh thu tháng: ${totalWon.toLocaleString()} ₩`
  );
}

async function reportByVong(chatId) {
  const rows = await getRows();
  const base = rows.map(parseRowToObj);
  const withV = assignVongPerBai(base);

  // CHỈ lấy các dòng CẮT SẠCH để cộng theo vòng toàn bộ
  const sumByV = new Map(); // vong -> won
  for (const o of withV) {
    if (!o.bai || !o.isClean) continue;
    sumByV.set(o.vong, (sumByV.get(o.vong) || 0) + (o.won || 0));
  }

  const list = [...sumByV.entries()].sort((a,b)=>a[0]-b[0]);
  if (!list.length) return send(chatId, "🔁 Chưa có dữ liệu cắt sạch để tính theo vòng.");

  let out = "🔁 THỐNG KÊ THEO VÒNG (cộng tất cả lượt CẮT SẠCH của mọi bãi)\n";
  for (const [v, won] of list) out += `\n• Vòng ${v}: ${won.toLocaleString()} ₩`;
  await send(chatId, out.trim());
}

async function reportByBai(chatId) {
  const rows = await getRows();
  const base = rows.map(parseRowToObj);
  const withV = assignVongPerBai(base);

  // bai -> map vong -> won (chỉ cắt sạch)
  const map = new Map();

  for (const o of withV) {
    if (!o.bai) continue;
    if (!map.has(o.bai)) map.set(o.bai, { vongs: new Map(), total: 0, lastClean: "" });
    const cur = map.get(o.bai);

    if (o.isClean) {
      cur.vongs.set(o.vong, (cur.vongs.get(o.vong) || 0) + (o.won || 0));
      cur.total += (o.won || 0);
      cur.lastClean = o.date || cur.lastClean;
    }
  }

  const items = [...map.entries()].sort((a,b)=> (b[1].total||0) - (a[1].total||0));
  if (!items.length) return send(chatId, "📍 Chưa có dữ liệu cắt sạch để thống kê theo bãi.");

  let out = "📍 THỐNG KÊ THEO BÃI (theo vòng 1/2/3... và tổng)\n";
  for (const [bai, v] of items) {
    const vongs = [...v.vongs.entries()].sort((a,b)=>a[0]-b[0])
      .map(([vv, won]) => `V${vv}: ${won.toLocaleString()} ₩`).join(" | ");
    const forecast = nextCutForecast(v.lastClean);
    out += `\n• ${bai}: ${vongs || "(chưa có vòng)"}\n  Tổng: ${v.total.toLocaleString()} ₩`;
    if (forecast) out += `\n  ⤷ Dự báo cắt lại: ${forecast}`;
    out += "\n";
  }
  await send(chatId, out.trim());
}

async function showLastRow(chatId) {
  const rows = await getRows();
  const last = await getLastRow(rows);
  if (!last) return send(chatId, "Chưa có dữ liệu.");
  const o = last.obj;
  await send(chatId,
`🧾 DÒNG GẦN NHẤT (row ${last.idx})
Date: ${o.date}
Thu: ${o.thu}
Bãi: ${o.bai}
Tình hình: ${o.tinhHinh}
Bao: ${o.baoTau} | Chuẩn: ${o.baoChuan}
Giá: ${o.giaK}k
Won: ${o.won.toLocaleString()} ₩
Note: ${o.note || ""}`.trim()
  );
}

async function sendHelp(chatId) {
  await send(chatId,
`✅ Cú pháp đúng:
A27 60b 220k
A27 30g 40b 220k
A27 80b 120k 5d

✅ Nghỉ:
nghỉ gió
làm bờ

🗑️ Xoá:
Bấm nút xoá → bot sẽ hỏi mã ${DELETE_PIN}.`
  );
}

/* ================= DELETE CONFIRM STATE =================
Dùng bộ nhớ RAM (Render restart thì mất, nhưng đủ dùng).
*/
const pending = new Map(); // chatId -> { type: "DEL_LAST"|"RESET_ALL", at: ms }

function askPin(chatId, type) {
  pending.set(String(chatId), { type, at: Date.now() });
  return send(chatId, `⚠️ Nhập mã ${DELETE_PIN} để xác nhận xoá.`);
}

function checkPin(chatId, text) {
  const p = pending.get(String(chatId));
  if (!p) return null;
  // hết hạn 2 phút
  if (Date.now() - p.at > 2 * 60 * 1000) {
    pending.delete(String(chatId));
    return null;
  }
  if (String(text).trim() === DELETE_PIN) {
    pending.delete(String(chatId));
    return p.type;
  }
  return "WRONG";
}

/* ================= MAIN HANDLER ================= */
async function handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "Bạn";
  const textRaw = (msg.text || "").trim();

  // luôn set menu khi /start hoặc lần đầu
  if (textRaw === "/start") {
    await setReplyMenu(chatId);
    return;
  }

  // nếu đang chờ nhập mã xoá
  const pinState = checkPin(chatId, textRaw);
  if (pinState === "WRONG") {
    await send(chatId, "❌ Sai mã. Huỷ xoá.");
    return;
  }
  if (pinState === "DEL_LAST") {
    const rows = await getRows();
    const idx = await findLastRowIndexAny(rows);
    if (!idx) return send(chatId, "Không có dữ liệu để xoá.");
    await clearRow(idx);
    await send(chatId, `✅ Đã xoá dòng gần nhất (row ${idx}).`);
    return;
  }
  if (pinState === "RESET_ALL") {
    await clearAllData();
    await send(chatId, "✅ Đã XOÁ SẠCH toàn bộ DATA (giữ header).");
    return;
  }

  // MENU clicks (reply keyboard)
  if (textRaw === MENU.MONTH) return reportMonth(chatId);
  if (textRaw === MENU.VONG) return reportByVong(chatId);
  if (textRaw === MENU.BAI) return reportByBai(chatId);
  if (textRaw === MENU.LAST) return showLastRow(chatId);
  if (textRaw === MENU.HELP) return sendHelp(chatId);

  if (textRaw === MENU.DEL) {
    await askPin(chatId, "DEL_LAST");
    return;
  }
  if (textRaw === MENU.RESET) {
    await askPin(chatId, "RESET_ALL");
    return;
  }

  // Sửa dòng gần nhất: user bấm nút -> bot hướng dẫn
  if (textRaw === MENU.EDIT) {
    await send(chatId,
`✏️ SỬA DÒNG GẦN NHẤT
Bạn gõ:  sua <cú pháp mới>
Ví dụ:  sua A27 60b 200k
Ví dụ:  sua A27 30g 40b 220k`
    );
    return;
  }

  // sửa: "sua <cú pháp mới>"
  if (textRaw.toLowerCase().startsWith("sua ")) {
    const newLine = textRaw.slice(4).trim();
    const parsed = parseWorkLine(newLine);
    if (!parsed || parsed.type !== "WORK") return send(chatId, SYNTAX_ERROR);

    const rows = await getRows();
    const rowIdx = await findLastWorkRowIndexForUser(rows, userName, parsed.viTri);
    if (!rowIdx) return send(chatId, "❌ Không tìm thấy dòng gần nhất để sửa cho bãi này.");

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

  // ====== nghiệp vụ nhập 1 dòng ======
  const parsed = parseWorkLine(textRaw);
  if (!parsed) return send(chatId, SYNTAX_ERROR);

  // nghỉ gió / làm bờ
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
    await send(chatId, `✅ Đã ghi: ${parsed.tinhHinh}.`);
    return;
  }

  // WORK
  const nowKST = kst();
  const workDate = parsed.d
    ? new Date(nowKST.getFullYear(), nowKST.getMonth(), parsed.d)
    : new Date(nowKST.getTime() - 86400000);

  const bc = baoChuan(parsed.b);
  const money = bc * parsed.k * 1000;

  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const totalBefore = objs.reduce((s,o)=>s+(o.won||0),0);

  const isClean = parsed.g === MAX_DAY[parsed.viTri];
  const vongDone = objs.filter(o => o.bai === parsed.viTri && o.maxG > 0 && o.dayG === o.maxG).length;
  const vongThis = isClean ? (vongDone + 1) : Math.max(1, vongDone + 1);

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

  // forecast dựa trên lần sạch gần nhất (hoặc chính lần này)
  let lastClean = "";
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.bai === parsed.viTri && o.maxG > 0 && o.dayG === o.maxG) { lastClean = o.date; break; }
  }
  const forecast = nextCutForecast(isClean ? ymd(workDate) : lastClean);

  await sendSoKim(chatId, userName, {
    date: ymd(workDate),
    bai: parsed.viTri,
    dayG: parsed.g,
    maxG: MAX_DAY[parsed.viTri],
    baoTau: parsed.b,
    baoChuan: bc,
    giaK: parsed.k,
    won: money,
  }, totalToNow, vongThis, forecast);
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body?.message) await handleTextMessage(body.message);
  } catch (e) {
    console.error("WEBHOOK ERROR:", e?.message || e);
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("✅ KIM BOT READY on", PORT, "|", VERSION));
