/**
 * KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN
 * FINAL – ONE SHOT – NO MORE EDIT
 * VERSION: KIM-SO-KIM-FINAL-LOCK-2025-12-15
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

console.log("🚀 RUNNING: KIM-SO-KIM-FINAL-LOCK-2025-12-15");

/* ================= ENV ================= */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/etc/secrets/google-service-account.json";

/* ================= CONFIG ================= */
const MAX_DAY = {
  A14: 69, A27: 60, A22: 60, "34": 109,
  B17: 69, B24: 69, C11: 59, C12: 59,
};
const BAO_RATE = 1.4;

/* ================= BASIC ================= */
app.get("/", (_, res) => res.send("KIM BOT OK"));
app.get("/ping", (_, res) => res.json({ ok: true }));

/* ================= SHEET ================= */
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const appendRow = (row) =>
  sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

const getRows = async () => {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A2:L",
  });
  return r.data.values || [];
};

/* ================= TELEGRAM ================= */
const send = (id, text) =>
  fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: id, text }),
  });

/* ================= TIME ================= */
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000);
const fmt = (d) =>
  ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"][d.getDay()]
  + `, ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;

/* ================= PARSE ================= */
function parse(text) {
  const t = text.toLowerCase();

  if (t.includes("nghỉ gió") || t.includes("làm bờ"))
    return { type: "NO_WORK", tinhHinh: "Làm bờ / Nghỉ gió" };

  const parts = text.split(/\s+/);
  const viTri = parts[0]?.toUpperCase();
  if (!MAX_DAY[viTri]) return null;

  let g, b, k, d;
  for (const p of parts) {
    if (p.endsWith("g")) g = +p.slice(0,-1);
    if (p.endsWith("b")) b = +p.slice(0,-1);
    if (p.endsWith("k")) k = +p.slice(0,-1);
    if (p.endsWith("d")) d = +p.slice(0,-1);
  }

  if (!b || !k) return null;
  if (!g) g = MAX_DAY[viTri];

  return { type:"WORK", viTri, g, b, k, d };
}

/* ================= STATS ================= */
const baoChuan = (b) => Math.round(b * BAO_RATE);
const tongThu = async () => (await getRows()).reduce((s,r)=>s+(+r[10]||0),0);
const vongBai = async (bai) =>
  (await getRows()).filter(r=>r[3]===bai && +r[4]===+r[5]).length;

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req,res)=>{
  res.sendStatus(200);
  const m = req.body?.message;
  if (!m?.text) return;

  const chat = m.chat.id;
  const name = m.from.first_name || "Bạn";
  const p = parse(m.text);

  if (!p) {
    await send(chat,
`❌ Nhập sai rồi bạn iu ơi 😅
Ví dụ:
A27 60b 220k
A27 30g 40b 220k
A27 80b 120k 5d`);
    return;
  }

  const now = kst();
  if (p.type==="NO_WORK") {
    await appendRow([new Date().toISOString(), now.toISOString().slice(0,10), name,"",0,0,p.tinhHinh,0,0,0,0,""]);
    return;
  }

  const date = p.d ? new Date(now.getFullYear(),now.getMonth(),p.d) : new Date(now-86400000);
  const bc = baoChuan(p.b);
  const money = bc * p.k * 1000;
  const vong = (await vongBai(p.viTri)) + (p.g===MAX_DAY[p.viTri]?1:0);
  const total = (await tongThu()) + money;

  await appendRow([
    new Date().toISOString(),
    date.toISOString().slice(0,10),
    name,
    p.viTri,
    p.g,
    MAX_DAY[p.viTri],
    p.g===MAX_DAY[p.viTri]?"Cắt sạch":"Chưa sạch",
    p.b,
    bc,
    p.k,
    money,
    ""
  ]);

  await send(chat,
`--- 🌊 SỔ KIM (Vòng: ${vong}) ---
Chào ${name}, đây là kết quả của lệnh bạn gửi

📅 Ngày: ${fmt(date)}
📍 Vị trí: ${p.viTri}
✂️ Tình hình: ${p.g===MAX_DAY[p.viTri]?"Cắt sạch":"Chưa sạch"} (${p.g}/${MAX_DAY[p.viTri]} dây)
📦 Sản lượng: ${p.b} bao lớn (≈ ${bc} bao tính tiền)
💰 Giá: ${p.k}k

💵 THU HÔM NAY: ${money.toLocaleString()} ₩
🏆 TỔNG THU TỚI THỜI ĐIỂM NÀY: ${Math.round(total/1_000_000)} triệu ₩
----------------------------------
(Dự báo nhanh: Bãi này sẽ cắt lại vào 30/12/2025)`
  );
});

/* ================= START ================= */
app.listen(process.env.PORT||10000,()=>console.log("✅ KIM BOT READY"));
