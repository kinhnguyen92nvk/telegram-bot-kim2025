/**
 * KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN
 * VERSION: KIM-SO-KIM-v1.4-CUMULATIVE-CLEAN-SCHEDULE-2025-12-15
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

const VERSION = "KIM-SO-KIM-v1.4-CUMULATIVE-CLEAN-SCHEDULE-2025-12-15";
console.log("🚀 RUNNING:", VERSION);

/* ================= ENV ================= */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/google-service-account.json";

const CUT_INTERVAL_DAYS = Number(process.env.CUT_INTERVAL_DAYS || 15);
const BAO_RATE = 1.4;
const DELETE_PIN = String(process.env.DELETE_PIN || "2525");

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

/* ================= REPLY MENU ================= */
const MENU = {
  MONTH: "📅 Thống kê tháng này",
  VONG: "🔁 Thống kê theo VÒNG",
  BAI: "📍 Thống kê theo BÃI",
  SCHEDULE: "📆 Lịch cắt các bãi",
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
      [MENU.BAI, MENU.SCHEDULE],
      [MENU.LAST, MENU.EDIT],
      [MENU.DEL, MENU.RESET],
      [MENU.HELP],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
  await send(chatId, "📌 MENU SỔ KIM (bấm nút để chạy):", { reply_markup });
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
function baoChuan(baoTau) {
  return Math.round(baoTau * BAO_RATE);
}
function nextCutForecast(lastCleanYmd) {
  if (!lastCleanYmd) return "";
  const d = new Date(lastCleanYmd + "T00:00:00");
  const next = new Date(d.getTime() + CUT_INTERVAL_DAYS * 86400000);
  const dd = String(next.getDate()).padStart(2, "0");
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const yyyy = next.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* ================= DATA PARSE ================= */
function parseRowToObj(r) {
  return {
    ts: r[0] || "",
    date: r[1] || "",
    thu: r[2] || "",
    bai: (r[3] ?? "").toString().trim(), // <-- ép string + trim để "34" luôn đúng
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
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function rowMonthKey(obj) {
  if (!obj.date || obj.date.length < 7) return "";
  return obj.date.slice(0, 7);
}

/* ================= PARSE INPUT ================= */
function parseWorkLine(text) {
  const lower = text.toLowerCase().trim();

  if (lower.includes("nghỉ gió") || lower.includes("lam bo") || lower.includes("làm bờ")) {
    return { type: "NO_WORK", tinhHinh: lower.includes("nghỉ gió") ? "Nghỉ gió" : "Làm bờ" };
  }

  const parts = text.trim().split(/\s+/);
  const viTri = parts[0]?.toUpperCase();
  if (!viTri || !MAX_DAY[viTri]) return null;

  let g = null, b = null, k = null, d = null;
  let note = "";

  const noteIdx = parts.findIndex((p) => p.toLowerCase().startsWith("note:"));
  if (noteIdx >= 0) note = parts.slice(noteIdx).join(" ").replace(/^note:\s*/i, "").trim();

  for (const p of parts) {
    if (/^\d+g$/i.test(p)) g = +p.slice(0, -1);
    if (/^\d+b$/i.test(p)) b = +p.slice(0, -1);
    if (/^\d+k$/i.test(p)) k = +p.slice(0, -1);
    if (/^\d+d$/i.test(p)) d = +p.slice(0, -1);
  }

  if (!b || !k) return null;
  if (!g) g = MAX_DAY[viTri]; // thiếu g -> coi như cắt sạch 1 lần

  return { type: "WORK", viTri, g, b, k, d, note };
}

const SYNTAX_ERROR =
`❌ Nhập sai rồi bạn iu ơi 😅
Ví dụ:
A27 60b 220k
A27 30g 40b 220k
A27 80b 120k 5d`;

/* ================= CUMULATIVE CLEAN + VONG =================
   Quy tắc mới:
   - Cắt sạch khi tổng g trong cùng 1 vòng đạt Max
   - Dòng "đạt đủ" sẽ được coi là CẮT SẠCH, vòng tăng +1 và reset cộng dồn về 0 cho vòng tiếp theo
*/
function computeProgress(objs) {
  const sorted = [...objs].sort((a, b) => (a.date + a.ts).localeCompare(b.date + b.ts));

  const sumG = new Map();      // bai -> g đã cộng trong vòng hiện tại
  const vongDone = new Map();  // bai -> số vòng đã hoàn thành

  const out = [];
  for (const o of sorted) {
    const bai = (o.bai || "").toString().trim();
    if (!bai || !MAX_DAY[bai]) {
      out.push({ ...o, vong: 0, isClean: false, progG: 0 });
      continue;
    }

    const maxG = MAX_DAY[bai];
    const prevSum = sumG.get(bai) || 0;
    const nextSum = Math.min(maxG, prevSum + (o.dayG || 0));
    const willClean = nextSum >= maxG;

    const done = vongDone.get(bai) || 0;
    const vong = done + 1; // đang ở vòng này

    out.push({ ...o, vong, isClean: willClean, progG: nextSum, maxG });

    if (willClean) {
      vongDone.set(bai, done + 1);
      sumG.set(bai, 0); // reset sang vòng mới
    } else {
      sumG.set(bai, nextSum);
    }
  }
  return out;
}

/* ================= OUTPUT TEMPLATE ================= */
async function sendSoKim(chatId, userName, objForCmd, totalToNowWon, vongForCmd, forecast, progGForCmd) {
  const dateObj = new Date(objForCmd.date + "T00:00:00");

  const isClean = progGForCmd >= objForCmd.maxG; // <-- dựa trên cộng dồn
  const tinhText = isClean ? "Cắt sạch" : "Chưa sạch";
  const showG = isClean ? objForCmd.maxG : progGForCmd; // hiển thị g đã đạt tới đâu

  const text =
`--- 🌊 SỔ KIM (Vòng: ${vongForCmd}) ---
Chào ${userName}, đây là kết quả của lệnh bạn gửi

📅 Ngày: ${fmtDayVN(dateObj)}
📍 Vị trí: ${objForCmd.bai}
✂️ Tình hình: ${tinhText} (${showG}/${objForCmd.maxG} dây)
📦 Sản lượng: ${objForCmd.baoTau} bao lớn (≈ ${objForCmd.baoChuan} bao tính tiền)
💰 Giá: ${objForCmd.giaK}k

💵 THU HÔM NAY: ${objForCmd.won.toLocaleString()} ₩
🏆 TỔNG THU TỚI THỜI ĐIỂM NÀY: ${moneyToTrieu(totalToNowWon)} ₩
----------------------------------
${forecast ? `(Dự báo nhanh: Bãi này sẽ cắt lại vào ${forecast})` : ""}`.trim();

  await send(chatId, text);
}

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

// Thống kê vòng = cộng DOANH THU của những dòng "đạt CẮT SẠCH" của tất cả bãi
async function reportByVong(chatId) {
  const rows = await getRows();
  const base = rows.map(parseRowToObj);
  const withP = computeProgress(base);

  const sumByV = new Map(); // vong -> won (chỉ dòng clean)
  for (const o of withP) {
    if (!o.bai || !o.isClean) continue;
    sumByV.set(o.vong, (sumByV.get(o.vong) || 0) + (o.won || 0));
  }

  const list = [...sumByV.entries()].sort((a, b) => a[0] - b[0]);
  if (!list.length) return send(chatId, "🔁 Chưa có dữ liệu cắt sạch để tính theo vòng.");

  let out = "🔁 THỐNG KÊ THEO VÒNG (cộng tất cả lượt CẮT SẠCH của mọi bãi)\n";
  for (const [v, won] of list) out += `\n• Vòng ${v}: ${won.toLocaleString()} ₩`;
  await send(chatId, out.trim());
}

// Thống kê theo bãi: V1/V2/V3... (chỉ tính dòng clean) + tổng + forecast
async function reportByBai(chatId) {
  const rows = await getRows();
  const base = rows.map(parseRowToObj);
  const withP = computeProgress(base);

  const map = new Map(); // bai -> { vongs:Map, total, lastClean }
  for (const o of withP) {
    if (!o.bai || !MAX_DAY[o.bai]) continue;
    if (!map.has(o.bai)) map.set(o.bai, { vongs: new Map(), total: 0, lastClean: "" });

    const cur = map.get(o.bai);
    if (o.isClean) {
      cur.vongs.set(o.vong, (cur.vongs.get(o.vong) || 0) + (o.won || 0));
      cur.total += (o.won || 0);
      cur.lastClean = o.date || cur.lastClean;
    }
  }

  const items = [...map.entries()].sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
  if (!items.length) return send(chatId, "📍 Chưa có dữ liệu cắt sạch để thống kê theo bãi.");

  let out = "📍 THỐNG KÊ THEO BÃI (theo vòng 1/2/3... và tổng)\n";
  for (const [bai, v] of items) {
    const vongs = [...v.vongs.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([vv, won]) => `V${vv}: ${won.toLocaleString()} ₩`)
      .join(" | ");

    const forecast = nextCutForecast(v.lastClean);
    out += `\n• ${bai}: ${vongs || "(chưa có vòng)"}\n  Tổng: ${v.total.toLocaleString()} ₩`;
    if (forecast) out += `\n  ⤷ Dự báo cắt lại: ${forecast}`;
    out += "\n";
  }
  await send(chatId, out.trim());
}

// Lịch cắt: dựa trên lần "đạt CẮT SẠCH" gần nhất (theo cộng dồn)
async function reportScheduleAll(chatId) {
  const rows = await getRows();
  const base = rows.map(parseRowToObj);
  const withP = computeProgress(base);

  const lastCleanByBai = {};
  for (const bai of Object.keys(MAX_DAY)) lastCleanByBai[bai] = "";

  for (const o of withP) {
    if (!o.bai || !MAX_DAY[o.bai]) continue;
    if (o.isClean) lastCleanByBai[o.bai] = o.date;
  }

  let out = `📆 LỊCH CẮT DỰ KIẾN (tất cả bãi)
(Theo lần CẮT SẠCH gần nhất + ${CUT_INTERVAL_DAYS} ngày)\n`;

  const order = Object.keys(MAX_DAY);
  for (const bai of order) {
    const last = lastCleanByBai[bai];
    if (!last) {
      out += `\n• ${bai}: (chưa có dữ liệu cắt sạch)`;
    } else {
      out += `\n• ${bai}: ${nextCutForecast(last)}`;
    }
  }
  await send(chatId, out.trim());
}

async function showLastRow(chatId) {
  const rows = await getRows();
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.ts || o.date || o.thu || o.bai || o.tinhHinh) {
      await send(chatId,
`🧾 DÒNG GẦN NHẤT (row ${2 + i})
Date: ${o.date}
Thu: ${o.thu}
Bãi: ${o.bai}
Tình hình: ${o.tinhHinh}
Bao: ${o.baoTau} | Chuẩn: ${o.baoChuan}
Giá: ${o.giaK}k
Won: ${o.won.toLocaleString()} ₩
Note: ${o.note || ""}`.trim()
      );
      return;
    }
  }
  await send(chatId, "Chưa có dữ liệu.");
}

async function sendHelp(chatId) {
  await send(chatId,
`✅ Cú pháp đúng:
A27 60b 220k
A27 30g 40b 220k
34 55g 35b 120k 13d

✅ Nghỉ:
nghỉ gió
làm bờ

🗑️ Xoá:
Bấm nút xoá → nhập mã ${DELETE_PIN}.`
  );
}

/* ================= DELETE CONFIRM STATE ================= */
const pending = new Map(); // chatId -> { type, at }

function askPin(chatId, type) {
  pending.set(String(chatId), { type, at: Date.now() });
  return send(chatId, `⚠️ Nhập mã ${DELETE_PIN} để xác nhận xoá.`);
}

function checkPin(chatId, text) {
  const p = pending.get(String(chatId));
  if (!p) return null;
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
    if (o.thu === userName && o.bai === viTri) return 2 + i;
  }
  return null;
}

/* ================= MAIN HANDLER ================= */
async function handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "Bạn";
  const textRaw = (msg.text || "").trim();

  if (textRaw === "/start") {
    await setReplyMenu(chatId);
    return;
  }

  // PIN confirm
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

  // MENU clicks
  if (textRaw === MENU.MONTH) return reportMonth(chatId);
  if (textRaw === MENU.VONG) return reportByVong(chatId);
  if (textRaw === MENU.BAI) return reportByBai(chatId);
  if (textRaw === MENU.SCHEDULE) return reportScheduleAll(chatId);
  if (textRaw === MENU.LAST) return showLastRow(chatId);
  if (textRaw === MENU.HELP) return sendHelp(chatId);

  if (textRaw === MENU.DEL) return askPin(chatId, "DEL_LAST");
  if (textRaw === MENU.RESET) return askPin(chatId, "RESET_ALL");

  if (textRaw === MENU.EDIT) {
    await send(chatId,
`✏️ SỬA DÒNG GẦN NHẤT
Bạn gõ:  sua <cú pháp mới>
Ví dụ:  sua A27 60b 200k
Ví dụ:  sua 34 55g 35b 120k 13d`
    );
    return;
  }

  // EDIT command
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

    const oldObj = parseRowToObj(rows[rowIdx - 2]);
    const newRow = [
      oldObj.ts || new Date().toISOString(),
      ymd(workDate),
      userName,
      parsed.viTri,
      parsed.g,
      MAX_DAY[parsed.viTri],
      "Tạm", // sẽ hiển thị theo cộng dồn, không dựa cột này nữa
      parsed.b,
      bc,
      parsed.k,
      money,
      parsed.note || oldObj.note || "",
    ];

    await updateRow(rowIdx, newRow);

    // RECALC theo cộng dồn
    const rowsAfter = await getRows();
    const objsAfter = rowsAfter.map(parseRowToObj);
    const totalToNow = objsAfter.reduce((s, o) => s + (o.won || 0), 0);

    const withP = computeProgress(objsAfter);
    const tsKey = newRow[0];
    const rec = withP.find((o) => o.ts === tsKey && o.bai === parsed.viTri);

    const vongThis = rec?.vong || 1;
    const progG = rec?.progG ?? parsed.g;

    let lastClean = "";
    for (let i = withP.length - 1; i >= 0; i--) {
      const o = withP[i];
      if (o.bai === parsed.viTri && o.isClean) { lastClean = o.date; break; }
    }
    const forecast = nextCutForecast(lastClean);

    await sendSoKim(chatId, userName, {
      date: ymd(workDate),
      bai: parsed.viTri,
      maxG: MAX_DAY[parsed.viTri],
      baoTau: parsed.b,
      baoChuan: bc,
      giaK: parsed.k,
      won: money,
    }, totalToNow, vongThis, forecast, progG);

    return;
  }

  // WORK / NO_WORK
  const parsed = parseWorkLine(textRaw);
  if (!parsed) return send(chatId, SYNTAX_ERROR);

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
      0,0,0,0,
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
  const totalBefore = objs.reduce((s, o) => s + (o.won || 0), 0);

  // append trước
  const ts = new Date().toISOString();
  await appendRow([
    ts,
    ymd(workDate),
    userName,
    parsed.viTri,
    parsed.g,
    MAX_DAY[parsed.viTri],
    "Tạm",
    parsed.b,
    bc,
    parsed.k,
    money,
    parsed.note || "",
  ]);

  // recalc sau khi append (để biết progG/vong/isClean đúng theo cộng dồn)
  const rowsAfter = await getRows();
  const objsAfter = rowsAfter.map(parseRowToObj);
  const withP = computeProgress(objsAfter);

  const rec = withP.find((o) => o.ts === ts);
  const vongThis = rec?.vong || 1;
  const progG = rec?.progG ?? parsed.g;

  // lastClean để forecast
  let lastClean = "";
  for (let i = withP.length - 1; i >= 0; i--) {
    const o = withP[i];
    if (o.bai === parsed.viTri && o.isClean) { lastClean = o.date; break; }
  }
  const forecast = nextCutForecast(lastClean);

  const totalToNow = totalBefore + money;

  await sendSoKim(chatId, userName, {
    date: ymd(workDate),
    bai: parsed.viTri,
    maxG: MAX_DAY[parsed.viTri],
    baoTau: parsed.b,
    baoChuan: bc,
    giaK: parsed.k,
    won: money,
  }, totalToNow, vongThis, forecast, progG);
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
