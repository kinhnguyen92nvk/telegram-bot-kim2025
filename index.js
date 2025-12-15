/**
 * =========================================================
 *  KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN
 *  FINAL CLEAN VERSION – ONE FILE – NO MORE EDIT
 *  2025-12-15
 * =========================================================
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

/* ===================== ENV ===================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/etc/secrets/google-service-account.json";

/* ===================== CONST ===================== */
const CONFIRM_CODE = "2525";
const BAO_RATE = 1.4;

// Max dây theo bãi (CHỐT)
const FIELD_MAX = {
  A14: 69,
  A27: 60,
  A22: 60,
  "34": 109,
  B17: 69,
  B24: 69,
  C11: 59,
  C12: 59,
};

/* ===================== APP ===================== */
const app = express();
app.use(express.json());

/* ===================== GOOGLE SHEET ===================== */
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function getRows() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "DATA!A2:L",
  });
  return res.data.values || [];
}

async function appendRow(row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "DATA!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

async function deleteLastRow() {
  const rows = await getRows();
  if (!rows.length) return false;
  const idx = rows.length + 1;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: 0,
              dimension: "ROWS",
              startIndex: idx - 1,
              endIndex: idx,
            },
          },
        },
      ],
    },
  });
  return true;
}

async function deleteAllRows() {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: "DATA!A2:Z",
  });
}

/* ===================== TELEGRAM ===================== */
async function send(chat_id, text, extra = {}) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, ...extra }),
  });
}

function menu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📅 Thống kê tháng này", callback_data: "STAT_MONTH" }],
        [{ text: "🔁 Thống kê theo VÒNG", callback_data: "STAT_ROUND" }],
        [{ text: "📍 Thống kê theo BÃI", callback_data: "STAT_FIELD" }],
        [{ text: "🗑️ Xóa dòng gần nhất", callback_data: "DEL_LAST" }],
        [{ text: "⚠️ XÓA SẠCH DỮ LIỆU", callback_data: "DEL_ALL" }],
      ],
    },
  };
}

/* ===================== HELPERS ===================== */
function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function formatMoney(n) {
  return n.toLocaleString("en-US");
}

/* ===================== PARSER ===================== */
function parseInput(text) {
  const t = text.toLowerCase().trim();

  if (t.includes("nghỉ gió") || t.includes("làm bờ") || t.includes("lam bo")) {
    return { type: "NO_WORK", tinhHinh: "Làm bờ / Nghỉ gió" };
  }

  const parts = text.split(/\s+/);
  const field = parts[0]?.toUpperCase();
  if (!FIELD_MAX[field]) return null;

  let g = null, b = null, k = null, d = null, note = "";

  for (const p of parts.slice(1)) {
    if (/^\d+g$/i.test(p)) g = parseInt(p);
    else if (/^\d+b$/i.test(p)) b = parseInt(p);
    else if (/^\d+k$/i.test(p)) k = parseInt(p);
    else if (/^\d+d$/i.test(p)) d = parseInt(p);
    else if (p.toLowerCase().startsWith("note:"))
      note = p.slice(5);
  }

  if (!b || !k) return null;

  const maxG = FIELD_MAX[field];
  const usedG = g ?? maxG;
  const clean = usedG === maxG;

  return {
    type: "WORK",
    field,
    usedG,
    maxG,
    clean,
    baoTau: b,
    baoChuan: Math.round(b * BAO_RATE),
    giaK: k,
    doanhThu: Math.round(b * BAO_RATE * k * 1000),
    dayOverride: d,
    note,
  };
}

/* ===================== STATS ===================== */
function statMonth(rows) {
  const now = kstNow();
  const monthKey = ymd(now).slice(0, 7);
  const daysFrom1 = now.getDate();

  const active = new Set();
  let work = 0;
  let total = 0;

  for (const r of rows) {
    if (!r[1] || !r[1].startsWith(monthKey)) continue;
    active.add(r[1]);
    if (Number(r[10]) > 0) {
      work++;
      total += Number(r[10]);
    }
  }

  const off = daysFrom1 - active.size;

  return (
    `📅 THỐNG KÊ THÁNG ${monthKey}\n\n` +
    `• Ngày làm: ${work}\n` +
    `• Ngày nghỉ: ${off}\n\n` +
    `💰 Doanh thu tháng: ${formatMoney(total)} ₩`
  );
}

function statRound(rows) {
  const clean = rows.filter((r) => r[6] === "Cắt sạch");
  let out = "🔁 THỐNG KÊ THEO VÒNG (TOÀN BỘ)\n\n";
  let sum = 0;

  clean.forEach((r, i) => {
    const m = Number(r[10]);
    sum += m;
    out += `• Vòng ${i + 1}: ${formatMoney(m)} ₩\n`;
  });

  out += `\n👉 Tổng: ${formatMoney(sum)} ₩`;
  return out;
}

function statField(rows) {
  const map = {};
  rows
    .filter((r) => r[6] === "Cắt sạch")
    .forEach((r) => {
      const f = r[3];
      if (!map[f]) map[f] = [];
      map[f].push(Number(r[10]));
    });

  let out = "📍 THỐNG KÊ THEO BÃI\n\n";
  for (const f in map) {
    let sum = 0;
    out += `🔹 ${f}\n`;
    map[f].forEach((m, i) => {
      sum += m;
      out += `  • Vòng ${i + 1}: ${formatMoney(m)} ₩\n`;
    });
    out += `  👉 Tổng: ${formatMoney(sum)} ₩\n\n`;
  }
  return out.trim();
}

/* ===================== STATE ===================== */
let pendingDelete = null;

/* ===================== WEBHOOK ===================== */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const msg = req.body.message;
  const cb = req.body.callback_query;

  try {
    // CALLBACK MENU
    if (cb) {
      const chatId = cb.message.chat.id;
      const rows = await getRows();

      if (cb.data === "STAT_MONTH")
        return send(chatId, statMonth(rows), menu());

      if (cb.data === "STAT_ROUND")
        return send(chatId, statRound(rows), menu());

      if (cb.data === "STAT_FIELD")
        return send(chatId, statField(rows), menu());

      if (cb.data === "DEL_LAST") {
        pendingDelete = "LAST";
        return send(chatId, "⚠️ Gõ 2525 để xác nhận xóa dòng gần nhất");
      }

      if (cb.data === "DEL_ALL") {
        pendingDelete = "ALL";
        return send(chatId, "🚨 Gõ: XOA 2525 để xác nhận xóa sạch dữ liệu");
      }
    }

    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // CONFIRM DELETE
    if (pendingDelete === "LAST" && text === CONFIRM_CODE) {
      await deleteLastRow();
      pendingDelete = null;
      return send(chatId, "✅ Đã xóa dòng gần nhất", menu());
    }

    if (pendingDelete === "ALL" && text === `XOA ${CONFIRM_CODE}`) {
      await deleteAllRows();
      pendingDelete = null;
      return send(chatId, "🧹 Đã xóa sạch dữ liệu – SỔ KIM bắt đầu lại", menu());
    }

    // NORMAL INPUT
    const p = parseInput(text);
    if (!p) {
      return send(
        chatId,
        "❌ Nhập sai rồi bạn iu ơi 😅\nVí dụ:\nA27 60b 220k\nA27 30g 40b 220k",
        menu()
      );
    }

    const now = kstNow();
    const workDate = p.dayOverride
      ? new Date(now.getFullYear(), now.getMonth(), p.dayOverride)
      : new Date(now.getTime() - 86400000);

    if (p.type === "NO_WORK") {
      await appendRow([
        new Date().toISOString(),
        ymd(workDate),
        "",
        "",
        0,
        0,
        p.tinhHinh,
        0,
        0,
        0,
        0,
        "",
      ]);
      return send(chatId, "✅ Đã ghi: Làm bờ / Nghỉ gió", menu());
    }

    await appendRow([
      new Date().toISOString(),
      ymd(workDate),
      "",
      p.field,
      p.usedG,
      p.maxG,
      p.clean ? "Cắt sạch" : "Chưa sạch",
      p.baoTau,
      p.baoChuan,
      p.giaK,
      p.doanhThu,
      p.note,
    ]);

    await send(
      chatId,
      `--- 🌊 SỔ KIM ---\n` +
        `📍 ${p.field}\n` +
        `✂️ ${p.clean ? "Cắt sạch" : "Chưa sạch"} (${p.usedG}/${p.maxG})\n` +
        `📦 ${p.baoTau} bao ≈ ${p.baoChuan}\n` +
        `💰 ${p.giaK}k\n\n` +
        `💵 THU: ${formatMoney(p.doanhThu)} ₩`,
      menu()
    );
  } catch (e) {
    console.error("ERROR:", e);
  }
});

/* ===================== START ===================== */
app.listen(process.env.PORT || 10000, () =>
  console.log("✅ KIM BOT FINAL CLEAN RUNNING")
);
