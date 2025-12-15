/**
 * KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN
 * VERSION: KIM-SO-KIM-v1.3-FULL-FINAL-ONEFILE-2025-12-15
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

console.log("🚀 RUNNING:", "KIM-SO-KIM-v1.3-FULL-FINAL-ONEFILE-2025-12-15");

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

/* ================= BASIC ================= */
app.get("/", (_, res) => res.send("KIM BOT OK"));
app.get("/ping", (_, res) =>
  res.json({ ok: true, version: "KIM-SO-KIM-v1.3-FULL-FINAL-ONEFILE-2025-12-15" })
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

async function sendMenu(chatId) {
  const reply_markup = {
    inline_keyboard: [
      [{ text: "📅 Thống kê tháng", callback_data: "M:MONTH" }],
      [{ text: "🔁 Thống kê theo VÒNG", callback_data: "M:VONG" }],
      [{ text: "📍 Thống kê theo BÃI", callback_data: "M:BAI" }],
      [{ text: "✏️ Sửa dòng gần nhất", callback_data: "M:EDIT_HELP" }],
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
function parseWorkLine(text) {
  const lower = text.toLowerCase().trim();

  if (lower.includes("nghỉ gió") || lower.includes("làm bờ") || lower.includes("lam bo")) {
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

/* ================= DATA MAP ================= */
function parseRowToObj(r) {
  return {
    ts: r[0] || "",
    date: r[1] || "",
    user: r[2] || "",
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

/* ================= VÒNG ================= */
// vòng theo bãi (giữ)
function assignVongByBai(objs) {
  const sorted = [...objs].sort((a,b) => (a.date+a.ts).localeCompare(b.date+b.ts));
  const done = new Map();
  const out = [];

  for (const o of sorted) {
    if (!o.bai) { out.push({ ...o, vong: 0 }); continue; }
    const d = done.get(o.bai) || 0;
    const isClean = o.maxG > 0 && o.dayG === o.maxG;
    const v = isClean ? d + 1 : Math.max(1, d + 1);
    if (isClean) done.set(o.bai, d + 1);
    out.push({ ...o, vong: v, isClean });
  }
  return out;
}

// vòng toàn cục
function assignGlobalVong(objs) {
  const cleans = objs
    .filter(o => o.maxG > 0 && o.dayG === o.maxG)
    .sort((a,b)=> (a.date+a.ts).localeCompare(b.date+b.ts));
  const map = new Map();
  cleans.forEach((o,i)=> map.set(o.ts, i+1));
  return map;
}

function nextCutForecast(lastCleanYmd) {
  if (!lastCleanYmd) return "";
  const d = new Date(lastCleanYmd + "T00:00:00");
  const next = new Date(d.getTime() + CUT_INTERVAL_DAYS * 86400000);
  return `${String(next.getDate()).padStart(2,"0")}/${String(next.getMonth()+1).padStart(2,"0")}/${next.getFullYear()}`;
}

/* ================= STATE XOÁ ================= */
const PENDING = new Map(); // chatId -> DEL_LAST | RESET_ALL

/* ================= REPORT ================= */
async function reportMonth(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);

  const now = kst();
  const ym = ymd(now).slice(0,7);

  const activeDays = new Set();
  const wind = new Set();
  const shore = new Set();
  let total = 0;

  for (const o of objs) {
    if (!o.date.startsWith(ym)) continue;
    if (o.won > 0) {
      activeDays.add(o.date);
      total += o.won;
    } else {
      const t = (o.tinhHinh || "").toLowerCase();
      if (t.includes("nghỉ gió")) wind.add(o.date);
      if (t.includes("làm bờ") || t.includes("lam bo")) shore.add(o.date);
      if (o.date) activeDays.add(o.date);
    }
  }

  const today = now.getDate();
  const allDays = new Set();
  for (let i=1;i<=today;i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), i);
    allDays.add(ymd(d));
  }
  const nghi = [...allDays].filter(d=>!activeDays.has(d)).length;

  await send(chatId,
`📅 THỐNG KÊ THÁNG ${ym}
• Ngày làm: ${activeDays.size - wind.size - shore.size}
• Nghỉ gió: ${wind.size}
• Làm bờ: ${shore.size}
• Ngày nghỉ: ${nghi}
• Doanh thu: ${total.toLocaleString()} ₩`);
  await sendMenu(chatId);
}

async function reportByVong(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const gMap = assignGlobalVong(objs);

  const sum = new Map();
  for (const o of objs) {
    if (o.maxG > 0 && o.dayG === o.maxG) {
      const v = gMap.get(o.ts);
      sum.set(v, (sum.get(v)||0) + o.won);
    }
  }

  let out = "🔁 THỐNG KÊ THEO VÒNG\n";
  [...sum.entries()].sort((a,b)=>a[0]-b[0]).forEach(([v,w])=>{
    out += `\n• Vòng ${v}: ${w.toLocaleString()} ₩`;
  });

  await send(chatId, out.trim());
  await sendMenu(chatId);
}

async function reportByBai(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const byBai = new Map();

  for (const o of objs) {
    if (!o.bai) continue;
    const cur = byBai.get(o.bai) || { won:0, bao:0, bc:0, lastClean:"" };
    cur.won += o.won;
    cur.bao += o.baoTau;
    cur.bc += o.baoChuan;
    if (o.maxG>0 && o.dayG===o.maxG) cur.lastClean = o.date;
    byBai.set(o.bai, cur);
  }

  let out = "📍 THỐNG KÊ THEO BÃI\n";
  for (const [b,v] of byBai.entries()) {
    out += `\n• ${b}: ${v.bao} bao | ≈ ${v.bc} | ${v.won.toLocaleString()} ₩`;
    const f = nextCutForecast(v.lastClean);
    if (f) out += `\n  ⤷ Cắt lại: ${f}`;
  }
  await send(chatId, out.trim());
  await sendMenu(chatId);
}

/* ================= MAIN ================= */
async function handleText(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text||"").trim();

  if (text === "/start") {
    await sendMenu(chatId);
    return;
  }

  if (PENDING.get(chatId)==="DEL_LAST" && text==="2525") {
    const rows = await getRows();
    if (rows.length) await clearRow(rows.length+1);
    await send(chatId,"✅ Đã xoá dòng gần nhất.");
    PENDING.delete(chatId);
    await sendMenu(chatId);
    return;
  }

  if (PENDING.get(chatId)==="RESET_ALL" && text==="XOA 2525") {
    await clearAllData();
    await send(chatId,"🧹 Đã xoá sạch DATA.");
    PENDING.delete(chatId);
    await sendMenu(chatId);
    return;
  }

  const parsed = parseWorkLine(text);
  if (!parsed) {
    await send(chatId,
`❌ Nhập sai.
Ví dụ:
A27 60b 220k
A27 30g 40b 220k
A27 80b 120k 5d`);
    return;
  }

  if (parsed.type==="NO_WORK") {
    const d = kst();
    await appendRow([
      new Date().toISOString(), ymd(d), "", "", 0,0, parsed.tinhHinh,0,0,0,0,""
    ]);
    await send(chatId,"✅ Đã ghi: Làm bờ / Nghỉ gió.");
    await sendMenu(chatId);
    return;
  }

  const now = kst();
  const workDate = parsed.d
    ? new Date(now.getFullYear(), now.getMonth(), parsed.d)
    : new Date(now.getTime()-86400000);

  const bc = baoChuan(parsed.b);
  const money = bc * parsed.k * 1000;

  const rows = (await getRows()).map(parseRowToObj);
  const total = rows.reduce((s,o)=>s+o.won,0);

  const isClean = parsed.g===MAX_DAY[parsed.viTri];
  let lastClean="";
  for (let i=rows.length-1;i>=0;i--){
    const o=rows[i];
    if (o.bai===parsed.viTri && o.maxG>0 && o.dayG===o.maxG){ lastClean=o.date; break;}
  }

  await appendRow([
    new Date().toISOString(),
    ymd(workDate),
    "",
    parsed.viTri,
    parsed.g,
    MAX_DAY[parsed.viTri],
    isClean?"Cắt sạch":"Chưa sạch",
    parsed.b,
    bc,
    parsed.k,
    money,
    parsed.note||""
  ]);

  const forecast = nextCutForecast(isClean?ymd(workDate):lastClean);

  await send(chatId,
`--- 🌊 SỔ KIM ---
📅 ${fmtDayVN(workDate)}
📍 ${parsed.viTri}
✂️ ${isClean?"Cắt sạch":"Chưa sạch"} (${parsed.g}/${MAX_DAY[parsed.viTri]})
📦 ${parsed.b} bao (≈ ${bc})
💰 ${parsed.k}k

💵 HÔM NAY: ${money.toLocaleString()} ₩
🏆 TỔNG: ${moneyToTrieu(total+money)} ₩
${forecast?`(Cắt lại: ${forecast})`:""}`);
  await sendMenu(chatId);
}

/* ================= CALLBACK ================= */
async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const data = cb.data;

  await fetch(`${TELEGRAM_API}/answerCallbackQuery`,{
    method:"POST",
    headers:{ "Content-Type":"application/json"},
    body:JSON.stringify({callback_query_id:cb.id})
  });

  if (data==="M:MONTH") return reportMonth(chatId);
  if (data==="M:VONG") return reportByVong(chatId);
  if (data==="M:BAI") return reportByBai(chatId);

  if (data==="M:DEL_LAST") {
    PENDING.set(chatId,"DEL_LAST");
    await send(chatId,"⚠️ Gõ **2525** để xoá dòng gần nhất.");
  }
  if (data==="M:RESET_ALL") {
    PENDING.set(chatId,"RESET_ALL");
    await send(chatId,"⚠️ Gõ **XOA 2525** để xoá sạch.");
  }
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req,res)=>{
  res.sendStatus(200);
  if (req.body?.message) await handleText(req.body.message);
  if (req.body?.callback_query) await handleCallback(req.body.callback_query);
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log("✅ KIM BOT READY"));
