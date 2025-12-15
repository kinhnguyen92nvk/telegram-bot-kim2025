/**
 * ============================================================
 * KIM BOT – SỔ KIM THU HOẠCH RONG BIỂN (FINAL)
 * VERSION: KIM-SO-KIM-v1.5-FINAL-2025-12-15
 * ============================================================
 *
 * ✅ Parsing:
 *   - "A27 60b 220k"        -> cắt sạch mặc định max dây
 *   - "A27 30g 40b 220k"    -> cắt 30 dây
 *   - "A27 80b 120k 5d"     -> ghi bù ngày dd trong tháng hiện tại
 *   - "nghỉ gió" / "làm bờ" -> ghi tình hình, doanh thu = 0
 *
 * ✅ Tính toán:
 *   - Bao chuẩn = round(baoTau * 1.4)
 *   - Doanh thu = baoChuan * (giaK * 1000)
 *
 * ✅ Vòng:
 *   - Mỗi BÃI có vòng riêng: Vòng tăng khi "cắt sạch" (dayG == maxG)
 *   - Thống kê THEO VÒNG: cộng tổng doanh thu của VÒNG 1 của TẤT CẢ BÃI,
 *     VÒNG 2 của TẤT CẢ BÃI, ... (chỉ tính các vòng ĐÃ KHÉP = đã có cắt sạch)
 *   - Một vòng = toàn bộ các dòng từ sau lần cắt sạch trước đó cho đến dòng cắt sạch.
 *
 * ✅ Menu Telegram:
 *   - Dùng REPLY KEYBOARD (hộp menu cố định của Telegram)
 *   - Không cần gõ "menu"
 *
 * ✅ Xóa:
 *   - Không cần quyền
 *   - Bấm "🗑️ Xoá dòng gần nhất" hoặc "⚠️ XOÁ SẠCH DỮ LIỆU"
 *     -> Bot yêu cầu nhập 2525 để xác nhận
 *
 * ✅ Sửa:
 *   - "sua <cú pháp mới>" -> sửa dòng gần nhất của bãi đó do người đó nhập
 *   - Sau sửa: tính lại vòng/tổng/lịch cắt và trả lại mẫu SỔ KIM chuẩn
 *
 * ============================================================
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

/* ============================ APP ============================ */
const app = express();
app.use(express.json());

const VERSION = "KIM-SO-KIM-v1.5-FINAL-2025-12-15";
console.log("🚀 RUNNING:", VERSION);

/* ============================ ENV ============================ */
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) console.warn("⚠️ Missing BOT_TOKEN env!");
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
if (!GOOGLE_SHEET_ID) console.warn("⚠️ Missing GOOGLE_SHEET_ID env!");

const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/etc/secrets/google-service-account.json";

const CUT_INTERVAL_DAYS = Number(process.env.CUT_INTERVAL_DAYS || 15);
const BAO_RATE = 1.4;

// MÃ XÁC NHẬN XÓA
const DELETE_CODE = "2525";
// Hết hạn xác nhận (ms)
const PENDING_TTL_MS = 5 * 60 * 1000;

/* ============================ CONFIG ============================ */
/** Max dây theo bãi (CHỐT) */
const MAX_DAY = {
  A14: 69,
  A27: 60,
  A22: 60,
  "34": 109, // bãi lớn
  B17: 69,
  B24: 69,
  C11: 59,
  C12: 59,
};

/* ============================ BASIC ROUTES ============================ */
app.get("/", (_, res) => res.send(`KIM BOT OK - ${VERSION}`));
app.get("/ping", (_, res) => res.json({ ok: true, version: VERSION }));

/* ============================ GOOGLE SHEETS ============================ */
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

/**
 * Sheet DATA columns A-L:
 * A Timestamp (ISO)
 * B Date (YYYY-MM-DD)
 * C Thu (tên người)
 * D ViTri (bãi)
 * E DayG
 * F MaxG
 * G TinhHinh
 * H BaoTau
 * I BaoChuan
 * J GiaK
 * K Won
 * L Note
 */
async function getRows() {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A2:L",
  });
  return r.data.values || [];
}

async function appendRow(row12) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "DATA!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row12] },
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
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range,
  });
}

/* ============================ TELEGRAM HELPERS ============================ */
async function tg(method, payload) {
  const url = `${TELEGRAM_API}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json().catch(() => ({}));
}

async function send(chatId, text, extra = {}) {
  return tg("sendMessage", { chat_id: chatId, text, ...extra });
}

/**
 * MENU (Reply Keyboard - hộp menu Telegram)
 * - Thay hết nút cũ bằng nút mới
 * - Người dùng không cần gõ "menu"
 */
const MENU_KEYBOARD = {
  keyboard: [
    [{ text: "📅 Thống kê tháng này" }, { text: "🔁 Thống kê theo VÒNG" }],
    [{ text: "📍 Thống kê theo BÃI" }, { text: "📆 Lịch cắt các bãi" }],
    [{ text: "✏️ Sửa dòng gần nhất" }, { text: "🗑️ Xoá dòng gần nhất" }],
    [{ text: "⚠️ XOÁ SẠCH DỮ LIỆU" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
  selective: false,
};

async function ensureMenu(chatId) {
  // Gửi “menu trống” để Telegram set keyboard
  return send(chatId, "📌 Menu Sổ Kim đã sẵn sàng.", {
    reply_markup: MENU_KEYBOARD,
  });
}

/* ============================ TIME / FORMAT ============================ */
function kst(d = new Date()) {
  // KST = UTC+9
  return new Date(d.getTime() + 9 * 3600 * 1000);
}

function ymd(d) {
  // d đã là KST date object => toISOString lấy UTC; nhưng ta đang shift KST trước rồi
  return d.toISOString().slice(0, 10);
}

function fmtDayVN(dateObjLocal) {
  const days = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const d = dateObjLocal;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${days[d.getDay()]}, ${dd}/${mm}`;
}

function moneyToTrieu(won) {
  // 50,000,000 => 50 triệu
  return `${Math.round(won / 1_000_000)} triệu`;
}

function wonFmt(x) {
  try {
    return Number(x || 0).toLocaleString();
  } catch {
    return String(x || 0);
  }
}

/* ============================ PARSE INPUT ============================ */
function parseWorkLine(text) {
  const raw = (text || "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase().trim();

  // NO_WORK
  if (lower.includes("nghỉ gió") || lower.includes("làm bờ") || lower.includes("lam bo")) {
    // phân biệt để thống kê
    if (lower.includes("nghỉ gió")) return { type: "NO_WORK", tinhHinh: "Nghỉ gió" };
    return { type: "NO_WORK", tinhHinh: "Làm bờ" };
  }

  const parts = raw.split(/\s+/);
  const viTri = parts[0]?.toUpperCase();
  if (!viTri || !MAX_DAY[viTri]) return null;

  let g = null,
    b = null,
    k = null,
    d = null;
  let note = "";

  // note:
  const noteIdx = parts.findIndex((p) => p.toLowerCase().startsWith("note:"));
  if (noteIdx >= 0) {
    note = parts
      .slice(noteIdx)
      .join(" ")
      .replace(/^note:\s*/i, "")
      .trim();
  }

  for (const p of parts) {
    if (/^\d+g$/i.test(p)) g = Number(p.slice(0, -1));
    if (/^\d+b$/i.test(p)) b = Number(p.slice(0, -1));
    if (/^\d+k$/i.test(p)) k = Number(p.slice(0, -1));
    if (/^\d+d$/i.test(p)) d = Number(p.slice(0, -1));
  }

  if (!b || !k) return null;
  if (!g) g = MAX_DAY[viTri];

  return { type: "WORK", viTri, g, b, k, d, note };
}

function baoChuan(baoTau) {
  return Math.round(Number(baoTau || 0) * BAO_RATE);
}

/* ============================ DATA MODEL ============================ */
function parseRowToObj(r = []) {
  return {
    ts: r[0] || "",
    date: r[1] || "", // YYYY-MM-DD
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

function sortKey(o) {
  // Ưu tiên date trước, rồi ts
  const d = o.date || "0000-00-00";
  const ts = o.ts || "";
  return `${d} ${ts}`;
}

/* ============================================================
 *  VÒNG LOGIC – FIX CHUẨN
 * ============================================================
 * Mục tiêu:
 *  - Mỗi bãi có vòng riêng
 *  - Một vòng gồm nhiều dòng (cắt 1 phần / nhiều phần)
 *  - Vòng chỉ KHÉP khi có dòng cắt sạch (dayG == maxG)
 *  - Thống kê theo VÒNG: cộng V1 của tất cả bãi, V2 của tất cả bãi...
 *
 * Cách làm:
 *  - Duyệt dữ liệu theo thời gian.
 *  - Với mỗi bãi, tạo "segment" hiện tại (vòng đang diễn ra).
 *  - Mỗi dòng WORK thuộc bãi:
 *      add won vào segment
 *      nếu line là clean => segment đóng lại và gán vongIndex (1..n)
 *  - NO_WORK không thuộc vòng.
 */
function buildSegmentsAndRunningTotals(objs) {
  const sorted = [...objs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  // running total (toàn bộ)
  let runningTotal = 0;

  // segments per bai
  const stateByBai = new Map();
  // all closed segments
  const closedSegments = []; // {bai, vong, won, startKey, endKey, endDate}
  // annotate each row with: idx, runningTotalAfter, vongThisRow, isClean
  const annotated = [];

  function getState(bai) {
    if (!stateByBai.has(bai)) {
      stateByBai.set(bai, {
        bai,
        done: 0, // số vòng đã khép
        openWon: 0,
        openStartKey: null,
      });
    }
    return stateByBai.get(bai);
  }

  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i];

    runningTotal += Number(o.won || 0);

    let vongThisRow = 0;
    let isClean = false;

    if (o.bai && MAX_DAY[o.bai]) {
      // chỉ xét "WORK" theo format DATA (tinhHinh = Cắt sạch/Chưa sạch)
      const isWorkRow = (o.tinhHinh || "").toLowerCase().includes("cắt") || (o.tinhHinh || "").toLowerCase().includes("chưa");
      // nhưng cũng an toàn: nếu có baoTau / giaK / won >0 thì coi là work
      const looksWork = o.won > 0 || o.baoTau > 0 || o.giaK > 0;

      if (isWorkRow || looksWork) {
        const st = getState(o.bai);
        if (!st.openStartKey) st.openStartKey = sortKey(o);

        st.openWon += Number(o.won || 0);

        isClean = o.maxG > 0 && o.dayG === o.maxG;
        if (isClean) {
          // đóng vòng
          const vong = st.done + 1;
          closedSegments.push({
            bai: o.bai,
            vong,
            won: st.openWon,
            startKey: st.openStartKey,
            endKey: sortKey(o),
            endDate: o.date || "",
          });
          st.done += 1;
          // reset mở vòng mới
          st.openWon = 0;
          st.openStartKey = null;
          vongThisRow = vong;
        } else {
          // đang ở vòng (done+1)
          vongThisRow = Math.max(1, st.done + 1);
        }
      }
    }

    annotated.push({
      ...o,
      __idx: i,
      __runningTotalAfter: runningTotal,
      __vongThisRow: vongThisRow,
      __isClean: isClean,
    });
  }

  return {
    sorted,
    annotated,
    closedSegments,
    runningTotalAll: runningTotal,
  };
}

/* ============================ FORECAST ============================ */
function addDaysToDate(ymdStr, days) {
  if (!ymdStr) return null;
  const d = new Date(`${ymdStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const next = new Date(d.getTime() + days * 86400000);
  const dd = String(next.getDate()).padStart(2, "0");
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const yyyy = next.getFullYear();
  return { dateObj: next, ddmmyyyy: `${dd}/${mm}/${yyyy}` };
}

/**
 * Lấy ngày cắt sạch gần nhất của 1 bãi từ dữ liệu (đã sort),
 * nếu không có => null
 */
function lastCleanDateForBai(annotated, bai) {
  for (let i = annotated.length - 1; i >= 0; i--) {
    const o = annotated[i];
    if (o.bai === bai && o.__isClean) return o.date || null;
  }
  return null;
}

/* ============================ FIND ROW INDEX ============================ */
async function findLastRowIndexAny(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.ts || o.date || o.thu || o.bai || o.tinhHinh) return 2 + i;
  }
  return null;
}

async function findLastWorkRowIndexForUserAndBai(rows, userName, bai) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = parseRowToObj(rows[i]);
    if (o.thu === userName && o.bai === bai && Number(o.won || 0) >= 0) {
      // cả work lẫn 0, nhưng bãi phải có
      return 2 + i;
    }
  }
  return null;
}

/* ============================ OUTPUT TEMPLATE ============================ */
function buildSoKimMessage(userName, objForThisCmd, totalToNowWon, vongForThisCmd, forecastDDMMYYYY) {
  const dateObj = new Date(`${objForThisCmd.date}T00:00:00`);
  const header =
`--- 🌊 SỔ KIM (Vòng: ${vongForThisCmd}) ---
Chào ${userName}, đây là kết quả của lệnh bạn gửi`.trim();

  const body =
`
📅 Ngày: ${fmtDayVN(dateObj)}
📍 Vị trí: ${objForThisCmd.bai}
✂️ Tình hình: ${objForThisCmd.tinhText} (${objForThisCmd.dayG}/${objForThisCmd.maxG} dây)
📦 Sản lượng: ${objForThisCmd.baoTau} bao lớn (≈ ${objForThisCmd.baoChuan} bao tính tiền)
💰 Giá: ${objForThisCmd.giaK}k

💵 THU HÔM NAY: ${wonFmt(objForThisCmd.won)} ₩
🏆 TỔNG THU TỚI THỜI ĐIỂM NÀY: ${moneyToTrieu(totalToNowWon)} ₩
----------------------------------
${forecastDDMMYYYY ? `(Dự báo nhanh: Bãi này sẽ cắt lại vào ${forecastDDMMYYYY})` : ""}`.trim();

  return `${header}\n${body}`.trim();
}

const WRONG_SYNTAX_TEXT =
`❌ Nhập sai rồi bạn iu ơi 😅
Ví dụ:
A27 60b 220k
A27 30g 40b 220k
A27 80b 120k 5d`.trim();

/* ============================ REPORTS ============================ */
function currentMonthKeyKST() {
  const now = kst();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function rowMonthKey(o) {
  if (!o.date || o.date.length < 7) return "";
  return o.date.slice(0, 7);
}

/**
 * Thống kê tháng:
 * - Số ngày làm: số ngày có won>0
 * - Nghỉ gió: số ngày có dòng "Nghỉ gió"
 * - Làm bờ: số ngày có dòng "Làm bờ"
 * - Tổng doanh thu tháng: sum won theo tháng
 */
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
      if (t.includes("nghỉ gió")) windDays.add(o.date || "");
      if (t.includes("làm bờ") || t.includes("lam bờ") || t.includes("lam bo")) shoreDays.add(o.date || "");
    }
  }

  const text =
`📅 THỐNG KÊ THÁNG ${monthKey}
• Số ngày làm: ${workDays.size}
• Nghỉ gió: ${windDays.size} ngày
• Làm bờ: ${shoreDays.size} ngày
• Tổng doanh thu tháng: ${wonFmt(totalWon)} ₩`.trim();

  await send(chatId, text, { reply_markup: MENU_KEYBOARD });
}

/**
 * Thống kê theo bãi:
 * - Tổng bao / chuẩn / tiền mỗi bãi
 * - Thêm breakdown theo vòng của bãi: V1, V2, V3...
 */
async function reportByBai(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const { annotated, closedSegments } = buildSegmentsAndRunningTotals(objs);

  // tổng theo bãi
  const sumBai = new Map(); // bai -> {baoTau, baoChuan, won}
  for (const o of annotated) {
    if (!o.bai) continue;
    const cur = sumBai.get(o.bai) || { baoTau: 0, baoChuan: 0, won: 0 };
    cur.baoTau += o.baoTau || 0;
    cur.baoChuan += o.baoChuan || 0;
    cur.won += o.won || 0;
    sumBai.set(o.bai, cur);
  }

  // breakdown vòng theo bãi (chỉ vòng đã khép)
  const byBaiV = new Map(); // bai -> Map(vong->won)
  for (const seg of closedSegments) {
    if (!byBaiV.has(seg.bai)) byBaiV.set(seg.bai, new Map());
    const m = byBaiV.get(seg.bai);
    m.set(seg.vong, (m.get(seg.vong) || 0) + (seg.won || 0));
  }

  // lịch cắt theo bãi (last clean + interval)
  const items = Object.keys(MAX_DAY).map((bai) => {
    const lastClean = lastCleanDateForBai(annotated, bai);
    const forecast = lastClean ? addDaysToDate(lastClean, CUT_INTERVAL_DAYS) : null;
    return { bai, lastClean, forecast };
  });

  // output
  let out = `📍 THỐNG KÊ THEO BÃI (tính từ DATA)\n`;
  const sortedBai = [...sumBai.entries()].sort((a, b) => (b[1].won || 0) - (a[1].won || 0));

  for (const [bai, v] of sortedBai) {
    out += `\n• ${bai}: ${v.baoTau} bao | ≈ ${v.baoChuan} chuẩn | ${wonFmt(v.won)} ₩`;

    const mv = byBaiV.get(bai);
    if (mv && mv.size) {
      const vv = [...mv.entries()].sort((a, b) => a[0] - b[0]);
      const brief = vv.map(([k, won]) => `V${k}: ${wonFmt(won)}₩`).join(" | ");
      out += `\n  ⤷ Theo vòng: ${brief}`;
    }

    const it = items.find((x) => x.bai === bai);
    if (it?.forecast?.ddmmyyyy) out += `\n  ⤷ Dự báo cắt lại: ${it.forecast.ddmmyyyy}`;
    else out += `\n  ⤷ Dự báo cắt lại: (chưa có dữ liệu cắt sạch)`;
  }

  await send(chatId, out.trim(), { reply_markup: MENU_KEYBOARD });
}

/**
 * Thống kê theo VÒNG (FIX):
 * - Vòng 1 = tổng tiền của Vòng 1 của TẤT CẢ BÃI (đã khép)
 * - Vòng 2 tương tự...
 * - Chỉ tính các vòng ĐÃ KHÉP (có cắt sạch)
 */
async function reportByVong(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const { closedSegments } = buildSegmentsAndRunningTotals(objs);

  // sum theo vong toàn hệ
  const sumByV = new Map(); // vong -> won
  // đồng thời giữ chi tiết theo bãi
  const sumByBaiV = new Map(); // bai -> Map(vong->won)

  for (const seg of closedSegments) {
    sumByV.set(seg.vong, (sumByV.get(seg.vong) || 0) + (seg.won || 0));

    if (!sumByBaiV.has(seg.bai)) sumByBaiV.set(seg.bai, new Map());
    const m = sumByBaiV.get(seg.bai);
    m.set(seg.vong, (m.get(seg.vong) || 0) + (seg.won || 0));
  }

  const vongs = [...sumByV.entries()].sort((a, b) => a[0] - b[0]);

  let out = "🔁 THỐNG KÊ THEO VÒNG (cộng tất cả lượt CẮT SẠCH của mọi bãi)\n";
  if (!vongs.length) {
    out += "\n• (Chưa có vòng nào khép – chưa có dòng cắt sạch)";
    await send(chatId, out.trim(), { reply_markup: MENU_KEYBOARD });
    return;
  }

  // liệt kê 1..n
  for (const [v, won] of vongs) {
    out += `\n• Vòng ${v}: ${wonFmt(won)} ₩`;
  }

  // thêm dòng tóm tắt theo từng bãi (ngắn gọn)
  out += "\n\nTheo từng bãi:";
  const allBai = Object.keys(MAX_DAY);
  for (const bai of allBai) {
    const m = sumByBaiV.get(bai);
    if (!m || !m.size) continue;
    const parts = [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([v, won]) => `V${v}: ${wonFmt(won)}₩`);
    out += `\n- ${bai}: ${parts.join(" | ")}`;
  }

  await send(chatId, out.trim(), { reply_markup: MENU_KEYBOARD });
}

/**
 * Lịch cắt các bãi:
 * - Lấy lần cắt sạch gần nhất của từng bãi, + CUT_INTERVAL_DAYS
 * - Sắp xếp theo ngày gần nhất -> xa nhất
 * - bãi chưa có cắt sạch -> đưa xuống cuối
 */
async function reportCutSchedule(chatId) {
  const rows = await getRows();
  const objs = rows.map(parseRowToObj);
  const { annotated } = buildSegmentsAndRunningTotals(objs);

  const list = Object.keys(MAX_DAY).map((bai) => {
    const lastClean = lastCleanDateForBai(annotated, bai);
    const forecast = lastClean ? addDaysToDate(lastClean, CUT_INTERVAL_DAYS) : null;
    return { bai, lastClean, forecast };
  });

  const withDate = list
    .filter((x) => x.forecast?.dateObj)
    .sort((a, b) => a.forecast.dateObj.getTime() - b.forecast.dateObj.getTime());

  const noDate = list.filter((x) => !x.forecast?.dateObj);

  let out =
`📆 LỊCH CẮT DỰ KIẾN (tất cả bãi)
(Theo lần CẮT SẠCH gần nhất + ${CUT_INTERVAL_DAYS} ngày)
`.trim();

  for (const it of withDate) {
    out += `\n• ${it.bai}: ${it.forecast.ddmmyyyy}`;
  }
  for (const it of noDate) {
    out += `\n• ${it.bai}: (chưa có dữ liệu cắt sạch)`;
  }

  await send(chatId, out.trim(), { reply_markup: MENU_KEYBOARD });
}

/* ============================ DELETE CONFIRM (2525) ============================ */
/**
 * pendingDeleteByChat:
 *  chatId -> { action: 'DEL_LAST'|'RESET_ALL', createdAt }
 */
const pendingDeleteByChat = new Map();

function setPending(chatId, action) {
  pendingDeleteByChat.set(String(chatId), { action, createdAt: Date.now() });
}
function getPending(chatId) {
  const x = pendingDeleteByChat.get(String(chatId));
  if (!x) return null;
  if (Date.now() - x.createdAt > PENDING_TTL_MS) {
    pendingDeleteByChat.delete(String(chatId));
    return null;
  }
  return x;
}
function clearPending(chatId) {
  pendingDeleteByChat.delete(String(chatId));
}

/* ============================ MAIN HANDLER ============================ */
async function handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "Bạn";
  const textRaw = (msg.text || "").trim();

  // đảm bảo menu luôn có
  // (lần đầu nhắn /start hoặc bất kỳ tin nhắn nào cũng set)
  if (textRaw === "/start") {
    await send(chatId, `✅ Bot đã sẵn sàng (${VERSION}).`, { reply_markup: MENU_KEYBOARD });
    return;
  }

  // Nếu đang chờ xác nhận xóa
  const pending = getPending(chatId);
  if (pending) {
    if (textRaw === DELETE_CODE) {
      if (pending.action === "DEL_LAST") {
        const rows = await getRows();
        const idx = await findLastRowIndexAny(rows);
        if (!idx) {
          await send(chatId, "Không có dữ liệu để xoá.", { reply_markup: MENU_KEYBOARD });
          clearPending(chatId);
          return;
        }
        await clearRow(idx);
        clearPending(chatId);
        await send(chatId, `✅ Đã xoá dòng gần nhất (row ${idx}).`, { reply_markup: MENU_KEYBOARD });
        return;
      }

      if (pending.action === "RESET_ALL") {
        await clearAllData();
        clearPending(chatId);
        await send(chatId, "✅ Đã XOÁ SẠCH toàn bộ DATA (giữ header). Bạn có thể làm lại từ đầu.", {
          reply_markup: MENU_KEYBOARD,
        });
        return;
      }
    }

    // nhập sai code => báo 1 câu ngắn
    await send(chatId, "❌ Sai mã xác nhận. Nếu muốn xoá, hãy nhập đúng 2525.", { reply_markup: MENU_KEYBOARD });
    return;
  }

  // MENU buttons (reply keyboard)
  if (textRaw === "📅 Thống kê tháng này") return reportMonth(chatId);
  if (textRaw === "🔁 Thống kê theo VÒNG") return reportByVong(chatId);
  if (textRaw === "📍 Thống kê theo BÃI") return reportByBai(chatId);
  if (textRaw === "📆 Lịch cắt các bãi") return reportCutSchedule(chatId);

  if (textRaw === "✏️ Sửa dòng gần nhất") {
    const help =
`✏️ SỬA DÒNG GẦN NHẤT
Bạn gõ:  sua <cú pháp mới>
Ví dụ:  sua A27 60b 200k
Ví dụ:  sua A27 30g 40b 220k
Ví dụ:  sua 34 109g 60b 220k 13d
(Chỉ sửa dòng gần nhất của BÃI đó do bạn nhập)`.trim();
    await send(chatId, help, { reply_markup: MENU_KEYBOARD });
    return;
  }

  if (textRaw === "🗑️ Xoá dòng gần nhất") {
    setPending(chatId, "DEL_LAST");
    await send(chatId, "⚠️ Xác nhận xoá dòng gần nhất: nhập 2525", { reply_markup: MENU_KEYBOARD });
    return;
  }

  if (textRaw === "⚠️ XOÁ SẠCH DỮ LIỆU") {
    setPending(chatId, "RESET_ALL");
    await send(chatId, "⚠️ Xác nhận XOÁ SẠCH dữ liệu: nhập 2525", { reply_markup: MENU_KEYBOARD });
    return;
  }

  // SỬA: "sua <...>"
  if (textRaw.toLowerCase().startsWith("sua ")) {
    const newLine = textRaw.slice(4).trim();
    const parsed = parseWorkLine(newLine);
    if (!parsed || parsed.type !== "WORK") {
      await send(chatId, WRONG_SYNTAX_TEXT, { reply_markup: MENU_KEYBOARD });
      return;
    }

    const rows = await getRows();
    const rowIdx = await findLastWorkRowIndexForUserAndBai(rows, userName, parsed.viTri);
    if (!rowIdx) {
      await send(chatId, "❌ Không tìm thấy dòng gần nhất để sửa cho bãi này.", { reply_markup: MENU_KEYBOARD });
      return;
    }

    // Tính ngày
    const nowKST = kst();
    const workDate = parsed.d
      ? new Date(nowKST.getFullYear(), nowKST.getMonth(), parsed.d)
      : new Date(nowKST.getTime() - 86400000);

    const bc = baoChuan(parsed.b);
    const money = bc * parsed.k * 1000;

    const isClean = parsed.g === MAX_DAY[parsed.viTri];
    const tinhHinh = isClean ? "Cắt sạch" : "Chưa sạch";

    // giữ timestamp cũ
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

    // Sau sửa: đọc lại dữ liệu và tính đúng tổng/vòng/forecast để trả SỔ KIM chuẩn
    const rows2 = await getRows();
    const objs2 = rows2.map(parseRowToObj);
    const { annotated } = buildSegmentsAndRunningTotals(objs2);

    // tìm lại dòng vừa sửa theo timestamp cũ (ưu tiên match ts)
    const tsNeedle = newRow[0];
    const edited = annotated.find((x) => x.ts === tsNeedle) || annotated[annotated.length - 1];

    const totalToNow = edited?.__runningTotalAfter || annotated.reduce((s, o) => s + (o.won || 0), 0);

    // forecast theo last clean
    const bai = parsed.viTri;
    const lastClean = lastCleanDateForBai(annotated, bai);
    const baseCleanDate = isClean ? ymd(workDate) : lastClean;
    const forecast = baseCleanDate ? addDaysToDate(baseCleanDate, CUT_INTERVAL_DAYS) : null;

    const tinhText = isClean ? "Cắt sạch" : "Chưa sạch";
    const msgSoKim = buildSoKimMessage(
      userName,
      {
        date: ymd(workDate),
        bai,
        dayG: parsed.g,
        maxG: MAX_DAY[bai],
        baoTau: parsed.b,
        baoChuan: bc,
        giaK: parsed.k,
        won: money,
        tinhText,
      },
      totalToNow,
      edited?.__vongThisRow || (isClean ? 1 : 1),
      forecast?.ddmmyyyy || ""
    );

    await send(chatId, msgSoKim, { reply_markup: MENU_KEYBOARD });
    return;
  }

  // ===== nghiệp vụ chính =====
  const parsed = parseWorkLine(textRaw);

  if (!parsed) {
    await send(chatId, WRONG_SYNTAX_TEXT, { reply_markup: MENU_KEYBOARD });
    return;
  }

  // NO_WORK
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

    await send(chatId, `✅ Đã ghi: ${parsed.tinhHinh}.`, { reply_markup: MENU_KEYBOARD });
    return;
  }

  // WORK
  const nowKST = kst();
  const workDate = parsed.d
    ? new Date(nowKST.getFullYear(), nowKST.getMonth(), parsed.d)
    : new Date(nowKST.getTime() - 86400000);

  const bc = baoChuan(parsed.b);
  const money = bc * parsed.k * 1000;

  const isClean = parsed.g === MAX_DAY[parsed.viTri];
  const tinhHinh = isClean ? "Cắt sạch" : "Chưa sạch";

  // append
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

  // đọc lại để tính tổng/vòng/forecast chuẩn theo dữ liệu hiện tại
  const rows2 = await getRows();
  const objs2 = rows2.map(parseRowToObj);
  const { annotated } = buildSegmentsAndRunningTotals(objs2);

  // tìm dòng mới theo timestamp vừa append
  const createdTs = row[0];
  const cur = annotated.find((x) => x.ts === createdTs) || annotated[annotated.length - 1];

  const totalToNow = cur?.__runningTotalAfter || annotated.reduce((s, o) => s + (o.won || 0), 0);

  // forecast
  const bai = parsed.viTri;
  const lastClean = lastCleanDateForBai(annotated, bai);
  const baseCleanDate = isClean ? ymd(workDate) : lastClean;
  const forecast = baseCleanDate ? addDaysToDate(baseCleanDate, CUT_INTERVAL_DAYS) : null;

  const tinhText = isClean ? "Cắt sạch" : "Chưa sạch";
  const msgSoKim = buildSoKimMessage(
    userName,
    {
      date: ymd(workDate),
      bai,
      dayG: parsed.g,
      maxG: MAX_DAY[bai],
      baoTau: parsed.b,
      baoChuan: bc,
      giaK: parsed.k,
      won: money,
      tinhText,
    },
    totalToNow,
    cur?.__vongThisRow || (isClean ? 1 : 1),
    forecast?.ddmmyyyy || ""
  );

  await send(chatId, msgSoKim, { reply_markup: MENU_KEYBOARD });
}

/* ============================ WEBHOOK ============================ */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body?.message) {
      await handleTextMessage(body.message);
      return;
    }
  } catch (e) {
    console.error("WEBHOOK ERROR:", e?.message || e);
  }
});

/* ============================ START ============================ */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("✅ KIM BOT READY on", PORT, "|", VERSION));
