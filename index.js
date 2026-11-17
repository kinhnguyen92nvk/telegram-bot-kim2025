/**
 * ============================================================
 * KIM BOT – HỆ THỐNG QUẢN LÝ VỤ MÙA LÀM KIM RONG BIỂN
 * VERSION: KIM-SO-KIM-v3.2-TURBO-FAST-2026-FINAL
 *
 * ⚡ TỐI ƯU TỐC ĐỘ CỰC NHANH (TURBO SPEED):
 * - Bộ nhớ đệm In-Memory Cache cho dữ liệu & cấu hình: phản hồi tức thì (< 50ms)
 * - Cache kiểm tra sheet: loại bỏ các lệnh get metadata lặp đi lặp lại
 * - Giảm tải tối đa số lần gọi Google Sheets API
 *
 * 📱 HỖ TRỢ MENU NÚT BẤM (INLINE BUTTONS) - HẠN CHẾ GÕ LỆNH:
 * - Đi thuốc 1 chạm: Bấm chọn đám (hoặc tất cả các đám) là xong
 * - Tách lưới 1 chạm: Bấm chọn đám là xong
 * - Tránh bão / Nghỉ biển 1 chạm: Bấm nút bão 1 ngày, bão 2 ngày, gió to, làm bờ
 * - Hạ thủy tàu 1 chạm
 * - Xóa dòng gần nhất: Bấm nút xác nhận, không cần gõ 2525
 * ============================================================
 */

import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

/* ================== APP ================== */
const app = express();
app.use(express.json());

const VERSION = "KIM-SO-KIM-v3.2-TURBO-FAST-2026-FINAL";
console.log("🚀 RUNNING:", VERSION);

/* ================== ENV ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/etc/secrets/google-service-account.json";

const CUT_INTERVAL_DAYS = Number(process.env.CUT_INTERVAL_DAYS || 15);
const BAO_RATE = 1.7; // 1 bao tàu = 1.7 bao chuẩn tính tiền
const CONFIRM_CODE = "2525";
const DEFAULT_NHA_MAY_DAY = 180; // Mặc định Lưới Nhà Máy = 180 dây
const KABEKI_MULTIPLIER = 5; // 1 đường kabeki = 5 đường lưới đơn

const INITIAL_SEASON_SEED = [
  [
    "A27",
    "Lưới Sò/Hàu (50 to, 3 nhỏ)",
    57,
    "2026-10-10",
    "",
    "2026-11-16",
    "Tổng bãi 57 đường | Đã thả 57/57 (10-13/10)",
  ],
  [
    "A22",
    "36 Nhà Máy + 3 Hàu/Sò",
    39,
    "2026-10-13",
    "",
    "2026-11-17",
    "Tổng bãi 57 đường | Đã thả 39/57 (3 sò + 36 nhà máy, còn trống 18)",
  ],
  [
    "A14",
    "Lưới Tự Nhiên",
    30,
    "2026-10-26",
    "",
    "",
    "Tổng bãi chưa chốt | Đang thả 30 đường (26-27/10)",
  ],
  [
    "KABEKI",
    "Kabeki (Lưới 5)",
    630,
    "",
    "",
    "",
    "Tổng gốc 126 kabeki x 5 = 630 đường lưới chờ tách",
  ],
];

const INITIAL_DATA_SEED_2026 = [
  ["2026-10-06T00:00:00.000Z", "2026-10-06", "Hệ thống", "TOÀN TÀU", 0, 0, "Hạ thủy", 0, 0, 0, 0, "Hạ thủy tàu đầu vụ 2026-2027"],
  ["2026-10-10T00:00:00.000Z", "2026-10-10", "Hệ thống", "A27", 17, 57, "Thả lưới", 0, 0, 0, 0, "Thả 17 đường lưới Sò/Hàu"],
  ["2026-10-11T00:00:00.000Z", "2026-10-11", "Hệ thống", "A27", 15, 57, "Thả lưới", 0, 0, 0, 0, "Thả 15 đường lưới Sò/Hàu"],
  ["2026-10-12T00:00:00.000Z", "2026-10-12", "Hệ thống", "A27", 15, 57, "Thả lưới", 0, 0, 0, 0, "Thả 15 đường lưới Sò/Hàu"],
  ["2026-10-13T00:00:00.000Z", "2026-10-13", "Hệ thống", "A27", 10, 57, "Thả lưới", 0, 0, 0, 0, "Thả 10 đường (tổng A27 đủ 57 đường)"],
  ["2026-10-13T00:00:00.000Z", "2026-10-13", "Hệ thống", "A22", 3, 39, "Thả lưới", 0, 0, 0, 0, "3 đường Sò/Hàu đưa từ A27 sang A22"],
  ["2026-10-19T00:00:00.000Z", "2026-10-19", "Hệ thống", "TOÀN TÀU", 0, 0, "Cột hàu", 0, 0, 0, 0, "Cột hàu ngày 1"],
  ["2026-10-20T00:00:00.000Z", "2026-10-20", "Hệ thống", "TOÀN TÀU", 0, 0, "Cột hàu", 0, 0, 0, 0, "Cột hàu ngày 2"],
  ["2026-10-22T00:00:00.000Z", "2026-10-22", "Hệ thống", "A22", 18, 39, "Thả lưới", 0, 0, 0, 0, "Thả 18 đường lưới Nhà Máy"],
  ["2026-10-23T00:00:00.000Z", "2026-10-23", "Hệ thống", "A22", 18, 39, "Thả lưới", 0, 0, 0, 0, "Thả 18 đường lưới Nhà Máy (tổng A22: 39 đường)"],
  ["2026-10-26T00:00:00.000Z", "2026-10-26", "Hệ thống", "A14", 15, 30, "Thả lưới", 0, 0, 0, 0, "Thả 15 đường lưới Tự Nhiên"],
  ["2026-10-27T00:00:00.000Z", "2026-10-27", "Hệ thống", "A14", 15, 30, "Thả lưới", 0, 0, 0, 0, "Thả 15 đường lưới Tự Nhiên (tổng A14: 30 đường)"],
  ["2026-11-07T00:00:00.000Z", "2026-11-07", "Hệ thống", "A22", 39, 39, "Đi thuốc sạch", 0, 0, 0, 0, "Đi thuốc đám A22 (lần đầu)"],
  ["2026-11-10T00:00:00.000Z", "2026-11-10", "Hệ thống", "A27", 57, 57, "Đi thuốc sạch", 0, 0, 0, 0, "Đi thuốc đám A27 (lần đầu)"],
  ["2026-11-12T00:00:00.000Z", "2026-11-12", "Hệ thống", "A22", 39, 39, "Đi thuốc sạch", 0, 0, 0, 0, "Đi thuốc đám A22 (cách lần trước 5 ngày)"],
  ["2026-11-16T00:00:00.000Z", "2026-11-16", "Hệ thống", "A27", 57, 57, "Đi thuốc sạch", 0, 0, 0, 0, "Đi thuốc đám A27 (cách lần trước 6 ngày)"],
  ["2026-11-17T00:00:00.000Z", "2026-11-17", "Hệ thống", "A22", 39, 39, "Đi thuốc sạch", 0, 0, 0, 0, "Đi thuốc đám A22 (cách lần trước 5 ngày)"],
];

/* ================== TIME (KST / UTC+9) ================== */
function kst(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000);
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDayVN(d) {
  const days = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${days[d.getDay()]}, ${dd}/${mm}/${yyyy}`;
}

function diffDays(ymd1, ymd2) {
  if (!ymd1 || !ymd2) return 0;
  const d1 = new Date(`${ymd1}T00:00:00Z`).getTime();
  const d2 = new Date(`${ymd2}T00:00:00Z`).getTime();
  return Math.round(Math.abs(d2 - d1) / 86400000);
}

function addDaysYmd(ymdStr, days) {
  if (!ymdStr) return "";
  const d = new Date(`${ymdStr}T00:00:00Z`);
  const next = new Date(d.getTime() + Number(days) * 86400000);
  const dd = String(next.getUTCDate()).padStart(2, "0");
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = next.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function moneyToTrieu(won) {
  return `${Math.round(Number(won || 0) / 1_000_000)} triệu`;
}

function baoChuan(baoTau) {
  return Math.round(Number(baoTau || 0) * BAO_RATE);
}

/* ================== QUẢN LÝ MÙA VỤ ================== */
function getSeasonKey(d = kst()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (m >= 6) {
    return `${y}_${y + 1}`;
  } else {
    return `${y - 1}_${y}`;
  }
}

function getSeasonDisplay(seasonKey = getSeasonKey()) {
  return seasonKey.replace("_", "-");
}

function getDataSheetName(seasonKey = getSeasonKey()) {
  return `DATA_${seasonKey}`;
}

function getConfigSheetName(seasonKey = getSeasonKey()) {
  return `CONFIG_${seasonKey}`;
}

/* ================== GOOGLE SHEETS & IN-MEMORY CACHE ================== */
const authConfig = GOOGLE_SERVICE_ACCOUNT_JSON
  ? {
      credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    }
  : {
      keyFile: GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    };
const auth = new google.auth.GoogleAuth(authConfig);
const sheets = google.sheets({ version: "v4", auth });

// Cache sheet check để không gọi spreadsheets.get lặp đi lặp lại
const verifiedSheets = new Set();

const CONFIG_HEADERS = [
  "DAM",
  "LOAI_LUOI",
  "SO_DAY",
  "NGAY_THA",
  "NGAY_TACH",
  "NGAY_THUOC_CUOI",
  "NOTE",
];

const DATA_HEADERS = [
  "Timestamp", // A
  "Date",      // B
  "Thu",       // C
  "ViTri",     // D
  "DayG",      // E
  "MaxG",      // F
  "TinhHinh",  // G
  "BaoTau",    // H
  "BaoChuan",  // I
  "GiaK",      // J
  "Won",       // K
  "Note",      // L
];

// Caches
let DAMS_CONFIG = {};
let MAX_DAY = {};
let cachedDataRows = [];
let isDataLoaded = false;

async function ensureSheetWithHeader(sheetName, headerRow) {
  if (verifiedSheets.has(sheetName)) return;
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      fields: "sheets.properties.title",
    });
    const titles = (meta.data.sheets || [])
      .map((s) => s.properties?.title)
      .filter(Boolean);

    if (!titles.includes(sheetName)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });

      const colEndLetter = String.fromCharCode(64 + headerRow.length);
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${sheetName}!A1:${colEndLetter}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headerRow] },
      });
      console.log(`✅ Created sheet ${sheetName}`);
    }
    verifiedSheets.add(sheetName);
  } catch (e) {
    console.error(`⚠️ ensureSheetWithHeader error (${sheetName}):`, e?.message || e);
  }
}

function normalizeLoaiLuoi(raw) {
  const s = String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

  if (s.includes("nhamay") || s === "nm") return "Lưới Nhà Máy";
  if (s.includes("tunhien") || s === "tn") return "Lưới Tự Nhiên";
  if (s.includes("so") || s.includes("hao") || s.includes("cothao") || s.includes("cotso"))
    return "Lưới Sò";
  return "Lưới Tự Nhiên";
}

async function loadConfigFromSheet() {
  const seasonKey = getSeasonKey();
  const cfgName = getConfigSheetName(seasonKey);
  await ensureSheetWithHeader(cfgName, CONFIG_HEADERS);
  await ensureSheetWithHeader(getDataSheetName(seasonKey), DATA_HEADERS);

  try {
    let res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${cfgName}!A2:G`,
    });
    let rows = res.data.values || [];

    // Nếu tab cấu hình vụ mùa mới chưa có dữ liệu -> tự động nạp dữ liệu khởi đầu (Kabeki, A27, A22, A14)
    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${cfgName}!A2:G${1 + INITIAL_SEASON_SEED.length}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: INITIAL_SEASON_SEED },
      });
      rows = INITIAL_SEASON_SEED;
      console.log(`✅ Seeded initial dams & Kabeki into ${cfgName}`);
    }

    const newMap = {};
    const newMaxDay = {};

    rows.forEach((r, idx) => {
      const dam = String(r?.[0] || "").trim().toUpperCase();
      if (!dam) return;

      const loaiLuoi = String(r?.[1] || "").trim() || "Lưới Tự Nhiên";
      let soDay = Number(r?.[2] || 0);
      if (loaiLuoi === "Lưới Nhà Máy" && (!soDay || soDay <= 0)) {
        soDay = DEFAULT_NHA_MAY_DAY;
      }
      if (!soDay || soDay <= 0) soDay = 60;

      newMap[dam] = {
        dam,
        loaiLuoi,
        soDay,
        ngayTha: r?.[3] || "",
        ngayTach: r?.[4] || "",
        ngayThuocCuoi: r?.[5] || "",
        note: r?.[6] || "",
        rowIndex: 2 + idx,
      };
      newMaxDay[dam] = soDay;
    });

    const DEFAULT_LEGACY_MAX_DAY = {
      A14: 69,
      A27: 60,
      A22: 60,
      "34": 109,
      B17: 69,
      B24: 69,
      C11: 59,
      C12: 59,
    };

    DAMS_CONFIG = newMap;
    MAX_DAY = { ...DEFAULT_LEGACY_MAX_DAY, ...newMaxDay };
    console.log(
      `✅ Loaded ${Object.keys(DAMS_CONFIG).length} đám từ tab ${cfgName}`
    );
  } catch (e) {
    console.log("ℹ️ Load config sheet error:", e?.message || e);
  }
}

async function upsertDamConfig(dam, patch = {}) {
  const damU = String(dam).trim().toUpperCase();
  const seasonKey = getSeasonKey();
  const cfgName = getConfigSheetName(seasonKey);
  await ensureSheetWithHeader(cfgName, CONFIG_HEADERS);

  const existing = DAMS_CONFIG[damU];
  const loaiLuoi = patch.loaiLuoi || existing?.loaiLuoi || "Lưới Nhà Máy";
  let soDay = Number(patch.soDay ?? existing?.soDay ?? 0);
  if (loaiLuoi === "Lưới Nhà Máy" && (!soDay || soDay <= 0)) {
    soDay = DEFAULT_NHA_MAY_DAY;
  }
  if (!soDay || soDay <= 0) soDay = 60;

  const ngayTha = patch.ngayTha !== undefined ? patch.ngayTha : existing?.ngayTha || "";
  const ngayTach = patch.ngayTach !== undefined ? patch.ngayTach : existing?.ngayTach || "";
  const ngayThuocCuoi =
    patch.ngayThuocCuoi !== undefined
      ? patch.ngayThuocCuoi
      : existing?.ngayThuocCuoi || "";
  const note = patch.note !== undefined ? patch.note : existing?.note || "";

  const rowValues = [damU, loaiLuoi, soDay, ngayTha, ngayTach, ngayThuocCuoi, note];

  if (existing && existing.rowIndex) {
    DAMS_CONFIG[damU] = {
      ...existing,
      loaiLuoi,
      soDay,
      ngayTha,
      ngayTach,
      ngayThuocCuoi,
      note,
    };
    MAX_DAY[damU] = soDay;

    sheets.spreadsheets.values
      .update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${cfgName}!A${existing.rowIndex}:G${existing.rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      })
      .catch((err) => console.error("Async updateDamConfig error:", err));
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${cfgName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowValues] },
    });
    await loadConfigFromSheet();
  }

  MAX_DAY[damU] = soDay;
  return DAMS_CONFIG[damU];
}

/* ================== THAO TÁC DATA VỚI IN-MEMORY CACHE (SIÊU NHANH) ================== */
async function getSeasonDataRows(forceRefresh = false) {
  if (isDataLoaded && !forceRefresh) {
    return cachedDataRows;
  }
  const seasonKey = getSeasonKey();
  const dataName = getDataSheetName(seasonKey);
  await ensureSheetWithHeader(dataName, DATA_HEADERS);

  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${dataName}!A2:L`,
    });
    cachedDataRows = r.data.values || [];

    // Nếu vụ 2026_2027 chưa có dữ liệu chính thức (chưa có dòng Hạ thủy 2026-10-06):
    // Xóa các dòng test cũ của năm nay (giữ nguyên tab DATA/CONFIG năm ngoái) và nạp chuẩn 17 dòng thực tế
    const hasOfficialSeed = cachedDataRows.some(
      (row) => row?.[1] === "2026-10-06" && row?.[6] === "Hạ thủy"
    );

    if (seasonKey === "2026_2027" && !hasOfficialSeed) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${dataName}!A2:L`,
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${dataName}!A2:L${1 + INITIAL_DATA_SEED_2026.length}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: INITIAL_DATA_SEED_2026 },
      });
      cachedDataRows = INITIAL_DATA_SEED_2026.map((row) => [...row]);

      const cfgName = getConfigSheetName(seasonKey);
      await ensureSheetWithHeader(cfgName, CONFIG_HEADERS);
      await sheets.spreadsheets.values.clear({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${cfgName}!A2:G`,
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${cfgName}!A2:G${1 + INITIAL_SEASON_SEED.length}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: INITIAL_SEASON_SEED },
      });
      await loadConfigFromSheet();
      console.log(`✅ Reset & Seeded 17 official rows into ${dataName}`);
    }

    isDataLoaded = true;
    return cachedDataRows;
  } catch (e) {
    console.log(`ℹ️ getSeasonDataRows error:`, e?.message || e);
    return cachedDataRows;
  }
}

async function appendSeasonDataRow(row12) {
  // Cập nhật cache tức thì để đọc lại ngay lập tức không bị trễ
  cachedDataRows.push(row12);

  const seasonKey = getSeasonKey();
  const dataName = getDataSheetName(seasonKey);
  await ensureSheetWithHeader(dataName, DATA_HEADERS);

  // Ghi Google Sheets
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${dataName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row12] },
  });
}

async function updateSeasonDataRow(rowNumber1Based, rowValues12) {
  const idx0 = rowNumber1Based - 2;
  if (idx0 >= 0 && idx0 < cachedDataRows.length) {
    cachedDataRows[idx0] = rowValues12;
  }

  const seasonKey = getSeasonKey();
  const dataName = getDataSheetName(seasonKey);
  const range = `${dataName}!A${rowNumber1Based}:L${rowNumber1Based}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowValues12] },
  });
}

async function clearSeasonDataRow(rowNumber1Based) {
  const idx0 = rowNumber1Based - 2;
  if (idx0 >= 0 && idx0 < cachedDataRows.length) {
    cachedDataRows.splice(idx0, 1);
  }

  const seasonKey = getSeasonKey();
  const dataName = getDataSheetName(seasonKey);
  const range = `${dataName}!A${rowNumber1Based}:L${rowNumber1Based}`;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range,
  });
}

async function clearAllSeasonData() {
  cachedDataRows = [];
  const seasonKey = getSeasonKey();
  const dataName = getDataSheetName(seasonKey);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${dataName}!A2:L`,
  });
}

/* ================== DỮ LIỆU VỤ CŨ (TAB DATA NĂM NGOÁI) ================== */
let cachedLegacyRows = null;
async function getLegacyDataRows() {
  if (cachedLegacyRows) return cachedLegacyRows;
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "DATA!A2:L",
    });
    cachedLegacyRows = r.data.values || [];
    return cachedLegacyRows;
  } catch (e) {
    console.log("ℹ️ getLegacyDataRows fallback:", e?.message || e);
    return [];
  }
}

async function reportLegacySeason(chatId) {
  const rows = await getLegacyDataRows();
  const objs = rows.map(rowToObj);
  let totalWon = 0;
  let totalBao = 0;

  for (const o of objs) {
    if (o.won > 0) {
      totalWon += o.won;
      totalBao += o.baoTau;
    }
  }

  const last10 = objs.filter((o) => o.won > 0).slice(-10);
  let listStr = "";
  last10.forEach((o) => {
    listStr += `• ${o.date}: ${o.bai} ${o.baoTau}b ${o.giaK}k (${Number(o.won).toLocaleString()} ₩)\n`;
  });

  const text =
`📂 DỮ LIỆU VỤ CŨ (LỊCH SỬ NĂM NGOÁI - TAB DATA)
----------------------------------
📦 Tổng sản lượng: ${totalBao.toLocaleString()} bao (≈ ${baoChuan(totalBao).toLocaleString()} bao chuẩn)
💵 TỔNG DOANH THU: ${totalWon.toLocaleString()} ₩ (${moneyToTrieu(totalWon)})
----------------------------------
📋 10 lệnh cắt cuối cùng của vụ cũ:
${listStr || "(Chưa có lệnh cắt nào)"}

💡 Toàn bộ dữ liệu này vẫn được lưu giữ an toàn 100% trong tab "DATA" trên Google Sheets của bạn.`.trim();

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

function rowToObj(r) {
  return {
    ts: r?.[0] || "",
    date: r?.[1] || "",
    thu: r?.[2] || "",
    bai: String(r?.[3] || "").trim().toUpperCase(),
    dayG: Number(r?.[4] || 0),
    maxG: Number(r?.[5] || 0),
    tinhHinh: r?.[6] || "",
    baoTau: Number(r?.[7] || 0),
    baoChuan: Number(r?.[8] || 0),
    giaK: Number(r?.[9] || 0),
    won: Number(r?.[10] || 0),
    note: r?.[11] || "",
  };
}

function sortByDateTs(objs) {
  return [...objs].sort((a, b) => (a.date + a.ts).localeCompare(b.date + b.ts));
}

function isWorkRow(o) {
  return (
    !!o.bai &&
    o.maxG > 0 &&
    (o.tinhHinh === "Cắt sạch" || o.tinhHinh === "Cắt dỡ")
  );
}

/* ================== TELEGRAM HELPERS ================== */
async function tg(method, payload) {
  try {
    const resp = await fetch(`${TELEGRAM_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await resp.json().catch(() => ({}));
  } catch (err) {
    console.error("tg fetch error:", err?.message || err);
    return {};
  }
}

async function send(chatId, text, extra = {}) {
  await tg("sendMessage", { chat_id: chatId, text, ...extra });
}

function buildMainKeyboard() {
  return {
    keyboard: [
      [{ text: "📋 Tình hình các đám" }, { text: "💊 Tình hình đi thuốc" }],
      [{ text: "📆 Lịch cắt các đám" }, { text: "💊 Ghi nhận ĐI THUỐC" }],
      [{ text: "🕸️ Ghi nhận TÁCH LƯỚI" }, { text: "📊 THỐNG KÊ MÙA VỤ" }],
      [{ text: "✏️ Sửa / 🗑️ Xóa dữ liệu" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
    is_persistent: false,
  };
}

async function showStatsHubMenu(chatId) {
  const inline_keyboard = [
    [
      { text: "📅 Thống kê tháng này", callback_data: "STATS:MONTH" },
      { text: "🔁 Thống kê theo Vòng", callback_data: "STATS:VONG" },
    ],
    [
      { text: "💰 Tổng thu Vụ mùa", callback_data: "STATS:SEASON" },
      { text: "📋 Lệnh cắt đã gửi", callback_data: "STATS:COMMANDS" },
    ],
    [
      { text: "📂 Xem dữ liệu Vụ cũ", callback_data: "SHOW:LEGACY_SEASON" },
      { text: "ℹ️ Hướng dẫn cú pháp", callback_data: "STATS:HELP" },
    ],
    [
      { text: "🚢 Mốc Hạ thủy / Thả lưới", callback_data: "STATS:HATHUY" },
      { text: "➕ Thêm/Sửa Đám & Dây", callback_data: "STATS:ADDDAM" },
    ],
  ];

  await send(
    chatId,
    `📊 THỐNG KÊ & QUẢN LÝ MÙA VỤ ${getSeasonDisplay()}\nChọn mục bạn muốn xem bên dưới:`,
    { reply_markup: { inline_keyboard } }
  );
}

/* ================== PARSE NGÀY LINH HOẠT ================== */
function parseCustomDate(token, defaultToYesterday = true) {
  const now = kst();
  if (!token) {
    if (defaultToYesterday) {
      return new Date(now.getTime() - 86400000);
    }
    return now;
  }

  const str = String(token).trim();
  if (/^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(str)) {
    const parts = str.split("/");
    const d = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    let y = parts[2] ? Number(parts[2]) : now.getFullYear();
    return new Date(y, m, d);
  }

  let dayNum = null;
  if (/^\d+d$/i.test(str)) {
    dayNum = Number(str.slice(0, -1));
  } else if (/^\d+$/.test(str)) {
    const n = Number(str);
    if (n >= 1 && n <= 31) dayNum = n;
  }

  if (dayNum != null) {
    return new Date(now.getFullYear(), now.getMonth(), dayNum);
  }

  return defaultToYesterday ? new Date(now.getTime() - 86400000) : now;
}

/* ================== TIẾN ĐỘ & TRẠNG THÁI CÁC ĐÁM ================== */
function computeBaiState(allObjs, bai) {
  const damU = String(bai).toUpperCase();
  const max = MAX_DAY[damU] || DAMS_CONFIG[damU]?.soDay || DEFAULT_NHA_MAY_DAY;

  const sorted = sortByDateTs(allObjs).filter((o) => o.bai === damU);
  let cleanDone = 0;
  let progress = 0;
  let lastCleanDate = "";
  let lastWorkDate = "";

  for (const o of sorted) {
    if (!isWorkRow(o)) continue;
    lastWorkDate = o.date || lastWorkDate;

    if (Number(o.dayG) >= max && max > 0) {
      cleanDone += 1;
      progress = 0;
      lastCleanDate = o.date || lastCleanDate;
    } else {
      progress = Math.min(Number(o.dayG || 0), max);
    }
  }

  const currentVong = Math.max(1, cleanDone + 1);
  return {
    bai: damU,
    max,
    cleanDone,
    currentVong,
    progress,
    lastCleanDate,
    lastWorkDate,
  };
}

function buildWorkProgress({ allObjs, bai, gDelta }) {
  const damU = String(bai).toUpperCase();
  const max = MAX_DAY[damU] || DAMS_CONFIG[damU]?.soDay || DEFAULT_NHA_MAY_DAY;
  const st = computeBaiState(allObjs, damU);

  let newProgress;
  let tinhHinh;

  if (!gDelta) {
    newProgress = max;
    tinhHinh = "Cắt sạch";
  } else {
    newProgress = Math.min(max, Number(st.progress || 0) + Number(gDelta));
    tinhHinh = newProgress >= max ? "Cắt sạch" : "Cắt dỡ";
  }

  const vong = st.currentVong;
  return { max, newProgress, tinhHinh, vong };
}

function computeLastPartialDelta(allObjs, bai) {
  const damU = String(bai).toUpperCase();
  const max = MAX_DAY[damU] || DAMS_CONFIG[damU]?.soDay || DEFAULT_NHA_MAY_DAY;
  const rows = allObjs.filter(
    (o) => o.bai === damU && (o.tinhHinh === "Cắt sạch" || o.tinhHinh === "Cắt dỡ")
  );
  if (!rows.length) return null;

  const last = rows[rows.length - 1];
  const lastProgress = Number(last.progress || last.dayG || 0);
  if (lastProgress >= max) return null;

  const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
  const prevProgress = prev ? Number(prev.progress || prev.dayG || 0) : 0;
  const delta = Math.max(0, lastProgress - prevProgress);
  return delta > 0 ? delta : lastProgress > 0 ? lastProgress : null;
}

function assignVongAll(objs) {
  const sorted = sortByDateTs(objs);
  const doneMap = new Map();
  const out = [];

  for (const o of sorted) {
    if (!isWorkRow(o)) {
      out.push({ ...o, vong: 0 });
      continue;
    }
    const bai = o.bai;
    const max = MAX_DAY[bai] || o.maxG || DEFAULT_NHA_MAY_DAY;
    const done = doneMap.get(bai) || 0;
    const vong = Math.max(1, done + 1);
    const clean = max > 0 && Number(o.dayG) >= Number(max);

    out.push({ ...o, vong, isClean: clean });
    if (clean) doneMap.set(bai, done + 1);
  }
  return out;
}

/* ================== PARSE LỆNH CẮT KIM ================== */
function parseWorkLine(text) {
  const raw = (text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  if (lower.startsWith("tranh bao") || lower.startsWith("nghi bao") || lower === "bao") {
    return { type: "TRANH_BAO" };
  }
  if (lower.includes("nghỉ gió") || lower.includes("nghi gio")) {
    return { type: "NO_WORK", tinhHinh: "Nghỉ gió" };
  }
  if (lower.includes("làm bờ") || lower.includes("lam bo")) {
    return { type: "NO_WORK", tinhHinh: "Làm bờ" };
  }

  const parts = raw.split(/\s+/);
  const bai = (parts[0] || "").toUpperCase();

  const hasB = parts.some((p) => /^\d+b$/i.test(p));
  const hasK = parts.some((p) => /^\d+k$/i.test(p));
  if (!hasB || !hasK) return null;

  let g = null;
  let b = null;
  let k = null;
  let dateToken = null;
  let note = "";

  const noteIdx = parts.findIndex((p) => p.toLowerCase().startsWith("note:"));
  if (noteIdx >= 0) {
    note = parts
      .slice(noteIdx)
      .join(" ")
      .replace(/^note:\s*/i, "")
      .trim();
  }

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (i === noteIdx) break;
    if (/^\d+g$/i.test(p)) g = Number(p.slice(0, -1));
    else if (/^\d+b$/i.test(p)) b = Number(p.slice(0, -1));
    else if (/^\d+k$/i.test(p)) k = Number(p.slice(0, -1));
    else if (/^\d+d$/i.test(p) || /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(p)) {
      dateToken = p;
    }
  }

  if (!b || !k) return null;
  return { type: "WORK", bai, gDelta: g, b, k, dateToken, note };
}

function parseMultiWorkLine(text) {
  const raw = (text || "").trim();
  if (!raw) return null;

  const parts = raw.split(/\s+/);
  if (parts.length < 4) return null;

  const idxB = parts.findIndex((p) => /^\d+b$/i.test(p));
  const idxK = parts.findIndex((p) => /^\d+k$/i.test(p));
  if (idxB === -1 || idxK === -1) return null;

  const totalB = Number(parts[idxB].slice(0, -1));
  const k = Number(parts[idxK].slice(0, -1));
  if (!Number.isFinite(totalB) || totalB <= 0 || !Number.isFinite(k) || k <= 0)
    return null;

  let dateToken = null;
  let idxDate = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d+d$/i.test(parts[i]) || /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(parts[i])) {
      dateToken = parts[i];
      idxDate = i;
      break;
    }
  }

  const bais = [];
  const baiSet = new Set();
  for (const p of parts) {
    const u = String(p || "").toUpperCase();
    if ((MAX_DAY[u] || DAMS_CONFIG[u]) && !baiSet.has(u)) {
      bais.push(u);
      baiSet.add(u);
    }
  }
  if (bais.length < 2) return null;

  const gByBai = {};
  let lastBai = null;
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    const u = String(t || "").toUpperCase();
    if (MAX_DAY[u] || DAMS_CONFIG[u]) {
      lastBai = u;
      continue;
    }
    if (/^\d+g$/i.test(t) && lastBai) {
      const g = Number(String(t).slice(0, -1));
      if (Number.isFinite(g) && g > 0) gByBai[lastBai] = g;
    }
  }

  const noteTokens = [];
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    const u = String(t || "").toUpperCase();
    if (MAX_DAY[u] || DAMS_CONFIG[u]) continue;
    if (/^\d+g$/i.test(t)) continue;
    if (i === idxB || i === idxK || i === idxDate) continue;
    noteTokens.push(t);
  }
  const note = noteTokens.join(" ").trim();

  const n = bais.length;
  const base = Math.floor(totalB / n);
  let rem = totalB - base * n;

  return bais.map((bai) => {
    const bShare = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return {
      type: "WORK",
      bai,
      gDelta: gByBai[bai] != null ? gByBai[bai] : null,
      b: bShare,
      k,
      dateToken,
      note,
      _metaTotalB: totalB,
    };
  });
}

function parseTiepMultiLine(text) {
  const raw = (text || "").trim();
  if (!raw || !raw.match(/^tiep\s+/i)) return null;

  const body = raw.replace(/^tiep\s+/i, "").trim();
  const parts = body.split(/\s+/);
  if (parts.length < 3) return null;

  const idxB = parts.findIndex((p) => /^\d+b$/i.test(p));
  const idxK = parts.findIndex((p) => /^\d+k$/i.test(p));
  if (idxB === -1 || idxK === -1) return null;

  const totalB = Number(parts[idxB].slice(0, -1));
  const k = Number(parts[idxK].slice(0, -1));
  if (!Number.isFinite(totalB) || totalB <= 0 || !Number.isFinite(k) || k <= 0)
    return null;

  let dateToken = null;
  let idxDate = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d+d$/i.test(parts[i]) || /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(parts[i])) {
      dateToken = parts[i];
      idxDate = i;
      break;
    }
  }

  const bais = [];
  const baiSet = new Set();
  for (const p of parts) {
    const u = String(p || "").toUpperCase();
    if ((MAX_DAY[u] || DAMS_CONFIG[u]) && !baiSet.has(u)) {
      bais.push(u);
      baiSet.add(u);
    }
  }
  if (bais.length < 1) return null;

  const noteTokens = [];
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    const u = String(t || "").toUpperCase();
    if (MAX_DAY[u] || DAMS_CONFIG[u]) continue;
    if (i === idxB || i === idxK || i === idxDate) continue;
    noteTokens.push(t);
  }
  const note = noteTokens.join(" ").trim();

  const n = bais.length;
  const base = Math.floor(totalB / n);
  let rem = totalB - base * n;

  return bais.map((bai) => {
    const bShare = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return {
      type: "TIEP",
      bai,
      b: bShare,
      k,
      dateToken,
      note,
      _metaTotalB: totalB,
    };
  });
}

/* ================== THỰC HIỆN LỆNH CẮT KIM ================== */
async function processWorkEntry(parsed, chatId, userName) {
  const damU = parsed.bai.toUpperCase();
  if (!MAX_DAY[damU]) {
    await upsertDamConfig(damU, {
      loaiLuoi: "Lưới Nhà Máy",
      soDay: DEFAULT_NHA_MAY_DAY,
    });
  }

  const workDate = parseCustomDate(parsed.dateToken, true);
  const dateYmd = ymd(workDate);

  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);

  const { max, newProgress, tinhHinh, vong } = buildWorkProgress({
    allObjs: objs,
    bai: damU,
    gDelta: parsed.gDelta,
  });

  const bc = baoChuan(parsed.b);
  const won = bc * parsed.k * 1000;

  const totalBefore = objs.reduce((s, o) => s + (o.won || 0), 0);
  const totalToNow = totalBefore + won;

  const stBefore = computeBaiState(objs, damU);
  const forecast =
    tinhHinh === "Cắt sạch"
      ? addDaysYmd(dateYmd, CUT_INTERVAL_DAYS)
      : stBefore.lastCleanDate
      ? addDaysYmd(stBefore.lastCleanDate, CUT_INTERVAL_DAYS)
      : "";

  await appendSeasonDataRow([
    new Date().toISOString(),
    dateYmd,
    userName,
    damU,
    newProgress,
    max,
    tinhHinh,
    parsed.b,
    bc,
    parsed.k,
    won,
    parsed.note || "",
  ]);

  const cfg = DAMS_CONFIG[damU];
  let thuocNote = "";
  if (cfg?.ngayThuocCuoi) {
    const kc = diffDays(cfg.ngayThuocCuoi, dateYmd);
    thuocNote = `\n💊 Lần đi thuốc gần nhất: ${cfg.ngayThuocCuoi} (cách đây ${kc} ngày)`;
  }

  const text =
`--- 🌊 SỔ KIM (Vòng: ${vong}) ---
[Vụ mùa: ${getSeasonDisplay()}]
Chào ${userName}, đây là kết quả lệnh của bạn:

📅 Ngày: ${fmtDayVN(workDate)}
📍 Đám: ${damU} (${cfg?.loaiLuoi || "Lưới Nhà Máy"})
✂️ Tình hình: ${tinhHinh} (${newProgress}/${max} dây)
📦 Sản lượng: ${parsed.b} bao lớn (≈ ${bc} bao chuẩn)
💰 Giá: ${parsed.k}k

💵 THU HÔM NAY: ${Number(won).toLocaleString()} ₩
🏆 TỔNG THU VỤ NÀY: ${moneyToTrieu(totalToNow)} ₩
----------------------------------${thuocNote}
${forecast ? `\n(Dự kiến cắt lại: ${forecast})` : ""}`.trim();

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

/* ================== CÁC HÀM XỬ LÝ SỰ KIỆN KỸ THUẬT ================== */

async function recordHaThuy(dateObj, chatId, userName) {
  const dateYmd = ymd(dateObj);
  await appendSeasonDataRow([
    new Date().toISOString(),
    dateYmd,
    userName,
    "TOÀN TÀU",
    0,
    0,
    "Hạ thủy",
    0,
    0,
    0,
    0,
    `Tàu hạ thủy xuất bến vụ mùa ${getSeasonDisplay()}`,
  ]);

  const text =
`🚢 [VỤ MÙA ${getSeasonDisplay()}] ĐÃ GHI NHẬN TÀU HẠ THỦY!
📅 Ngày: ${fmtDayVN(dateObj)}
Chúc đội tàu một vụ mùa bội thu, thuận buồm xuôi gió! 🌊⚓`;

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

async function recordThaLuoi(dam, loaiLuoi, soDay, dateObj, chatId, userName) {
  const damU = dam.toUpperCase();
  const dateYmd = ymd(dateObj);

  await upsertDamConfig(damU, {
    loaiLuoi,
    soDay,
    ngayTha: dateYmd,
  });

  await appendSeasonDataRow([
    new Date().toISOString(),
    dateYmd,
    userName,
    damU,
    0,
    soDay,
    "Thả lưới",
    0,
    0,
    0,
    0,
    `Thả ${loaiLuoi} (${soDay} dây)`,
  ]);

  const text =
`⚓ ĐÃ GHI NHẬN THẢ LƯỚI
[Vụ mùa: ${getSeasonDisplay()}]
📍 Đám: ${damU}
🕸️ Loại lưới: ${loaiLuoi}
📏 Quy mô: ${soDay} dây
📅 Ngày thả: ${fmtDayVN(dateObj)}`;

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

async function recordTachLuoi(dam, dateObj, chatId, userName) {
  const damU = dam.toUpperCase();
  const dateYmd = ymd(dateObj);
  const cfg = DAMS_CONFIG[damU] || {};

  let kcNgay = "";
  if (cfg.ngayTha) {
    const kc = diffDays(cfg.ngayTha, dateYmd);
    kcNgay = `Sau ${kc} ngày kể từ khi thả lưới (${cfg.ngayTha})`;
  }

  await upsertDamConfig(damU, { ngayTach: dateYmd });

  await appendSeasonDataRow([
    new Date().toISOString(),
    dateYmd,
    userName,
    damU,
    0,
    cfg.soDay || 0,
    "Tách lưới",
    0,
    0,
    0,
    0,
    kcNgay || "Tách lưới",
  ]);

  const text =
`🕸️ ĐÃ GHI NHẬN TÁCH LƯỚI
📍 Đám: ${damU} (${cfg.loaiLuoi || "Lưới Tự Nhiên"})
📅 Ngày tách: ${fmtDayVN(dateObj)}
${kcNgay ? `⏱️ Thời gian: ${kcNgay}` : ""}`.trim();

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

function isThuocRow(o) {
  return (
    o.tinhHinh === "Đi thuốc" ||
    o.tinhHinh === "Đi thuốc sạch" ||
    o.tinhHinh === "Đi thuốc dỡ"
  );
}

function computeThuocState(allObjs, dam) {
  const damU = String(dam || "").toUpperCase();
  const cfg = DAMS_CONFIG[damU] || {};
  const max = Number(cfg.soDay || MAX_DAY[damU] || 60);

  const sorted = sortByDateTs(allObjs).filter(
    (o) => o.bai === damU && isThuocRow(o)
  );

  let progress = 0;
  let lastCleanDate = "";
  let lastAnyDate = "";

  for (const o of sorted) {
    lastAnyDate = o.date || lastAnyDate;
    if (
      o.tinhHinh === "Đi thuốc" ||
      o.tinhHinh === "Đi thuốc sạch" ||
      (o.dayG >= max && max > 0)
    ) {
      progress = 0; // hoàn thành lượt thuốc, reset cho lượt tiếp theo
      lastCleanDate = o.date || lastCleanDate;
    } else {
      progress = Math.min(max, Number(o.dayG || 0));
    }
  }

  return {
    dam: damU,
    max,
    progress,
    remain: Math.max(0, max - progress),
    lastCleanDate,
    lastAnyDate,
  };
}

async function recordDiThuoc(damList, dateObj, chatId, userName, gDelta = null) {
  const dateYmd = ymd(dateObj);
  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);
  const reportItems = [];

  for (const dam of damList) {
    const damU = dam.toUpperCase();
    const cfg = DAMS_CONFIG[damU] || {};
    const st = computeThuocState(objs, damU);
    const max = st.max;

    let newProgress;
    let tinhHinh;

    if (!gDelta) {
      newProgress = max;
      tinhHinh = "Đi thuốc sạch";
    } else {
      newProgress = Math.min(max, st.progress + Number(gDelta));
      tinhHinh = newProgress >= max ? "Đi thuốc sạch" : "Đi thuốc dỡ";
    }

    let kcMsg = "";
    if (tinhHinh === "Đi thuốc sạch") {
      if (st.lastCleanDate) {
        const kc = diffDays(st.lastCleanDate, dateYmd);
        kcMsg = `Đi sạch (${newProgress}/${max}đ) - Cách lần trước ${kc} ngày (${st.lastCleanDate})`;
      } else if (cfg.ngayTha) {
        const kc = diffDays(cfg.ngayTha, dateYmd);
        kcMsg = `Đi sạch (${newProgress}/${max}đ) - Lần đầu (sau thả ${kc} ngày)`;
      } else {
        kcMsg = `Đi sạch (${newProgress}/${max}đ)`;
      }
      await upsertDamConfig(damU, { ngayThuocCuoi: dateYmd });
    } else {
      const remain = Math.max(0, max - newProgress);
      kcMsg = `Đi dỡ ${newProgress}/${max}đ (còn ${remain}đ chưa đi)`;
    }

    await appendSeasonDataRow([
      new Date().toISOString(),
      dateYmd,
      userName,
      damU,
      newProgress,
      max,
      tinhHinh,
      0,
      0,
      0,
      0,
      kcMsg,
    ]);

    reportItems.push(`• Bãi ${damU}: ${kcMsg}`);
  }

  const text =
`💊 ĐÃ GHI NHẬN ĐI THUỐC
📅 Ngày: ${fmtDayVN(dateObj)}
${reportItems.join("\n")}`;

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

async function recordNghiBien(type, days, dateObj, chatId, userName) {
  const dateYmd = ymd(dateObj);
  let title = "Tránh bão";
  let desc = `Nghỉ tránh bão biển (${days} ngày)`;

  if (type === "GIO") {
    title = "Nghỉ gió";
    desc = "Nghỉ gió to biển động";
  } else if (type === "BO") {
    title = "Làm bờ";
    desc = "Làm công việc bờ";
  }

  await appendSeasonDataRow([
    new Date().toISOString(),
    dateYmd,
    userName,
    "TOÀN TÀU",
    0,
    0,
    title,
    0,
    0,
    0,
    0,
    desc,
  ]);

  let text = "";
  if (type === "BAO") {
    text =
`🌀 ĐÃ GHI NHẬN NGHỈ TRÁNH BÃO
📅 Ngày: ${fmtDayVN(dateObj)}
Thời gian: ${days} ngày nghỉ bão.
Đã tính vào ngày nghỉ của tháng (lịch cắt kim giữ nguyên theo quy tắc).`;
  } else if (type === "GIO") {
    text = `💨 ĐÃ GHI NHẬN: Nghỉ gió to biển động (${fmtDayVN(dateObj)})`;
  } else {
    text = `⚓ ĐÃ GHI NHẬN: Làm bờ (${fmtDayVN(dateObj)})`;
  }

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

/* ================== QUẢN LÝ KABEKI (LƯỚI 5) & THẢ THÊM ================== */
function getActiveDams() {
  return Object.keys(DAMS_CONFIG)
    .filter((d) => d !== "KABEKI")
    .sort();
}

function getKabekiStats(objs) {
  const kbkCfg = DAMS_CONFIG["KABEKI"];
  const totalLines = Number(kbkCfg?.soDay || 630);
  const totalKbk = Math.round((totalLines / KABEKI_MULTIPLIER) * 10) / 10;

  let splitKbk = 0;
  for (const o of objs) {
    if (o.tinhHinh === "Tách lưới Kabeki") {
      splitKbk += Number(o.dayG || 0);
    }
  }

  const remainKbk = Math.max(0, Math.round((totalKbk - splitKbk) * 10) / 10);
  const movedLines = splitKbk * 4;
  const stayLines = splitKbk * 1;

  return { totalKbk, totalLines, splitKbk, remainKbk, movedLines, stayLines };
}

async function recordTachKabeki(soKabeki, targetDam, dateObj, chatId, userName) {
  const kbk = Number(soKabeki);
  if (!Number.isFinite(kbk) || kbk <= 0) {
    await send(chatId, "❌ Số đường kabeki cần tách phải lớn hơn 0.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const dateYmd = ymd(dateObj);
  const tongLuoi = kbk * KABEKI_MULTIPLIER; // 5 đường/kabeki
  const movedLines = kbk * 4; // 4 đường chuyển sang bãi mới
  const stayLines = kbk * 1; // 1 đường ở lại vị trí gốc Kabeki

  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);
  const statsBefore = getKabekiStats(objs);

  // KHÔNG TRỪ soDay gốc của KABEKI (giữ nguyên tổng ban đầu 126 kabeki = 630 đường)
  await upsertDamConfig("KABEKI", {
    loaiLuoi: "Kabeki (Lưới 5)",
    soDay: statsBefore.totalLines,
    ngayTach: dateYmd,
    note: `Tổng gốc ${statsBefore.totalKbk} kabeki (${statsBefore.totalLines} lưới) | Đã tách: ${statsBefore.splitKbk + kbk} kabeki`,
  });

  let damInfo = "";
  if (targetDam) {
    const damU = targetDam.toUpperCase();
    const damCfg = DAMS_CONFIG[damU] || { loaiLuoi: "Lưới Tách (Kabeki)", soDay: 0 };
    const newDamDay = Number(damCfg.soDay || 0) + movedLines;
    await upsertDamConfig(damU, {
      soDay: newDamDay,
      ngayTach: dateYmd,
      note: `${damCfg.note ? damCfg.note + " | " : ""}+${movedLines} đường từ tách ${kbk} kabeki`,
    });
    damInfo = `\n📍 Bãi ${damU} nhận: +${movedLines} đường (Tổng bãi ${damU}: ${newDamDay} đường)`;
  } else {
    damInfo = `\n📍 Đưa đi tách: ${movedLines} đường (4 đường/kabeki)`;
  }

  await appendSeasonDataRow([
    new Date().toISOString(),
    dateYmd,
    userName,
    targetDam ? targetDam.toUpperCase() : "KABEKI",
    kbk,        // E: số kabeki đã tách
    movedLines, // F: số đường chuyển sang bãi mới (4x)
    "Tách lưới Kabeki",
    0,
    0,
    0,
    0,
    `Tách ${kbk} kabeki (${tongLuoi} lưới): Chuyển ${movedLines} đường${targetDam ? ` -> ${targetDam.toUpperCase()}` : ""} | Ở lại gốc ${stayLines} đường`,
  ]);

  const newSplit = statsBefore.splitKbk + kbk;
  const newRemain = Math.max(0, Math.round((statsBefore.totalKbk - newSplit) * 10) / 10);

  const text =
`🕸️ ĐÃ TÁCH LƯỚI KABEKI (QUY TẮC 4 + 1)
📅 Ngày: ${fmtDayVN(dateObj)}
✂️ Tách đợt này: ${kbk} kabeki (= ${tongLuoi} đường lưới)${damInfo}
⚓ Ở lại vị trí Kabeki gốc: ${stayLines} đường (1 đường/kabeki)
----------------------------------
📦 Tổng gốc thả biển (giữ nguyên): ${statsBefore.totalKbk} kabeki (${statsBefore.totalLines} đường)
✅ Tổng đã tách: ${newSplit} kabeki | Chờ tách: ${newRemain} kabeki`;

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

async function recordThemKabeki(soKabeki, dateObj, chatId, userName) {
  const kbk = Number(soKabeki);
  if (!Number.isFinite(kbk) || kbk <= 0) {
    await send(chatId, "❌ Số kabeki phải lớn hơn 0.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const dateYmd = ymd(dateObj);
  const addDuong = kbk * KABEKI_MULTIPLIER;
  const kbkCfg = DAMS_CONFIG["KABEKI"] || { soDay: 0 };
  const newDuong = Number(kbkCfg.soDay || 0) + addDuong;
  const newKbk = Math.round((newDuong / KABEKI_MULTIPLIER) * 10) / 10;

  await upsertDamConfig("KABEKI", {
    loaiLuoi: "Kabeki (Lưới 5)",
    soDay: newDuong,
    ngayTha: dateYmd,
    note: `${newKbk} kabeki x 5 = ${newDuong} đường lưới chờ tách`,
  });

  await appendSeasonDataRow([
    new Date().toISOString(),
    dateYmd,
    userName,
    "KABEKI",
    0,
    addDuong,
    "Thả Kabeki",
    0,
    0,
    0,
    0,
    `Thả thêm ${kbk} kabeki = ${addDuong} đường lưới`,
  ]);

  const text =
`⚓ ĐÃ THẢ THÊM KABEKI (LƯỚI 5)
📅 Ngày: ${fmtDayVN(dateObj)}
➕ Thả thêm: ${kbk} kabeki (= ${addDuong} đường lưới)
📦 Tổng Kabeki hiện tại: ${newKbk} kabeki (= ${newDuong} đường lưới)`;

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

async function recordThaThem(dam, addDay, loaiStr, dateObj, chatId, userName) {
  const damU = dam.toUpperCase();
  const n = Number(addDay);
  if (!damU || !Number.isFinite(n) || n <= 0) {
    await send(chatId, "❌ Cú pháp: tha them <Đám> <SốĐường> [Loại: nm/tn/so]", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const dateYmd = ymd(dateObj);
  const cfg = DAMS_CONFIG[damU] || { loaiLuoi: "Lưới Tự Nhiên", soDay: 0, note: "" };
  const loai = loaiStr ? normalizeLoaiLuoi(loaiStr) : cfg.loaiLuoi;
  const newTotal = Number(cfg.soDay || 0) + n;
  const loaiText =
    cfg.loaiLuoi && loaiStr && !cfg.loaiLuoi.includes(loai)
      ? `${cfg.loaiLuoi} + ${n} ${loai}`
      : cfg.loaiLuoi || loai;

  await upsertDamConfig(damU, {
    loaiLuoi: loaiText,
    soDay: newTotal,
    ngayTha: cfg.ngayTha || dateYmd,
    note: `Đã thả ${newTotal} đường (vừa thả thêm ${n} đường ngày ${dateYmd})`,
  });

  await appendSeasonDataRow([
    new Date().toISOString(),
    dateYmd,
    userName,
    damU,
    0,
    newTotal,
    "Thả thêm lưới",
    0,
    0,
    0,
    0,
    `Thả thêm ${n} đường (${loai}) -> Tổng ${newTotal} đường`,
  ]);

  await send(
    chatId,
    `⚓ ĐÃ THẢ THÊM VÀO ĐÁM ${damU}\n➕ Thêm: ${n} đường (${loai})\n📏 Tổng đã thả hiện tại: ${newTotal} đường`,
    { reply_markup: buildMainKeyboard() }
  );
}

/* ================== MENU INLINE BUTTONS (1 CHẠM - KHÔNG CẦN GÕ) ================== */

async function showThuocMenu(chatId) {
  const dams = getActiveDams();
  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);
  const inline_keyboard = [];

  for (let i = 0; i < dams.length; i += 2) {
    const d1 = dams[i];
    const st1 = computeThuocState(objs, d1);
    const label1 =
      st1.progress > 0 ? `💊 ${d1} (dỡ ${st1.progress}/${st1.max})` : `💊 Bãi ${d1} (${st1.max}đ)`;
    const row = [{ text: label1, callback_data: `THUOC_PICK:${d1}` }];

    if (dams[i + 1]) {
      const d2 = dams[i + 1];
      const st2 = computeThuocState(objs, d2);
      const label2 =
        st2.progress > 0 ? `💊 ${d2} (dỡ ${st2.progress}/${st2.max})` : `💊 Bãi ${d2} (${st2.max}đ)`;
      row.push({ text: label2, callback_data: `THUOC_PICK:${d2}` });
    }
    inline_keyboard.push(row);
  }

  const text =
`💊 GHI NHẬN ĐI THUỐC (GIỐNG CẮT KIM)
• Bấm chọn bãi bên dưới để chọn **Đi sạch** hoặc **Đi dỡ số đường**.
• Hoặc gõ nhanh:
  - thuoc A27 (đi sạch A27 hôm nay)
  - thuoc A27 30 (đi dỡ 30 đường hôm nay)
  - thuoc A27 30g 15/11 (đi dỡ 30 đường ngày 15/11)`;

  await send(chatId, text, {
    reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined,
  });
}

async function showTachLuoiMenu(chatId) {
  const dams = getActiveDams();
  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);
  const kbkStats = getKabekiStats(objs);

  const inline_keyboard = [
    [
      { text: "🕸️ Tách 5 Kabeki", callback_data: "KABEKI_TACH:5" },
      { text: "🕸️ Tách 10 Kabeki", callback_data: "KABEKI_TACH:10" },
    ],
    [
      { text: "🕸️ Tách 20 Kabeki", callback_data: "KABEKI_TACH:20" },
    ],
  ];

  for (let i = 0; i < dams.length; i += 2) {
    const row = [
      { text: `🕸️ Tách Đám ${dams[i]}`, callback_data: `TACH:${dams[i]}` },
    ];
    if (dams[i + 1]) {
      row.push({
        text: `🕸️ Tách Đám ${dams[i + 1]}`,
        callback_data: `TACH:${dams[i + 1]}`,
      });
    }
    inline_keyboard.push(row);
  }

  const text =
`🕸️ TÁCH LƯỚI & KABEKI (QUY TẮC 4 + 1)
📦 Tổng Kabeki thả biển: ${kbkStats.totalKbk} kabeki (= ${kbkStats.totalLines} lưới)
✅ Đã tách: ${kbkStats.splitKbk} kabeki | Chưa tách: ${kbkStats.remainKbk} kabeki

• Gõ lệnh tách vào bãi cụ thể (4 đường sang bãi, 1 đường ở lại vị trí Kabeki):
  VD: tach kabeki 10 B24
  (B24 nhận 40 đường, 10 đường ở lại vị trí gốc Kabeki)
• Hoặc bấm nhanh nút phía trên.`;

  await send(chatId, text, {
    reply_markup: { inline_keyboard },
  });
}

async function showNghiBienMenu(chatId) {
  const inline_keyboard = [
    [
      { text: "🌀 Tránh bão 1 ngày", callback_data: "NGHI:BAO:1" },
      { text: "🌀 Tránh bão 2 ngày", callback_data: "NGHI:BAO:2" },
      { text: "🌀 Tránh bão 3 ngày", callback_data: "NGHI:BAO:3" },
    ],
    [
      { text: "💨 Nghỉ gió to", callback_data: "NGHI:GIO:1" },
      { text: "⚓ Làm việc bờ", callback_data: "NGHI:BO:1" },
    ],
  ];

  const text =
`🌊 GHI NHẬN NGHỈ BIỂN (1 CHẠM)
Chọn tình hình hôm nay:
(Tránh bão được tính vào ngày nghỉ của tháng, không làm lệch lịch cắt kim)`;

  await send(chatId, text, { reply_markup: { inline_keyboard } });
}

async function showHaThuyMenu(chatId) {
  const inline_keyboard = [
    [{ text: "🚢 Tàu Hạ Thủy Hôm Nay", callback_data: "HATHUY:TODAY" }],
    [
      { text: "⚓ Thả Đám A (Nhà Máy 180d)", callback_data: "THA:A:NM" },
      { text: "⚓ Thả Đám B (Nhà Máy 180d)", callback_data: "THA:B:NM" },
    ],
    [
      { text: "⚓ Thả Đám C (Nhà Máy 180d)", callback_data: "THA:C:NM" },
      { text: "⚓ Thả Đám D (Nhà Máy 180d)", callback_data: "THA:D:NM" },
    ],
  ];

  const text =
`🚢 MỐC HẠ THỦY & THẢ LƯỚI
Bấm nút bên dưới để ghi nhận ngay hôm nay:
(Hoặc gõ: "tha luoi B tn 70" nếu là lưới tự nhiên / sò)`;

  await send(chatId, text, { reply_markup: { inline_keyboard } });
}

async function showAddDamMenu(chatId) {
  const inline_keyboard = [
    [
      { text: "➕ Thêm Đám A (180d)", callback_data: "ADD_DAM:A:180" },
      { text: "➕ Thêm Đám B (180d)", callback_data: "ADD_DAM:B:180" },
    ],
    [
      { text: "➕ Thêm Đám C (180d)", callback_data: "ADD_DAM:C:180" },
      { text: "➕ Thêm Đám D (180d)", callback_data: "ADD_DAM:D:180" },
    ],
    [
      { text: "➕ Thêm Đám E (180d)", callback_data: "ADD_DAM:E:180" },
      { text: "➕ Thêm Đám F (180d)", callback_data: "ADD_DAM:F:180" },
    ],
  ];

  const text =
`⚙️ THÊM / CÀI ĐẶT ĐÁM
• Bấm nút trên để tạo nhanh đám Nhà Máy 180 dây.
• Hoặc gõ lệnh:
  them dam <Tên> <Loại: nm/tn/so> [SốDây]
  Ví dụ: them dam B tn 75 (Lưới tự nhiên 75 dây)
  Ví dụ: sua day A 185 (Sửa số dây)`;

  await send(chatId, text, { reply_markup: { inline_keyboard } });
}

/* ================== THỐNG KÊ & BÁO CÁO ================== */
async function reportAllDamsStatus(chatId) {
  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);
  const dams = getActiveDams();
  const kbkCfg = DAMS_CONFIG["KABEKI"];
  const kbkStats = getKabekiStats(objs);

  if (!dams.length && !kbkCfg) {
    await send(
      chatId,
      `📋 Chưa có đám nào được thiết lập trong Vụ mùa ${getSeasonDisplay()}.\nBấm "📊 THỐNG KÊ MÙA VỤ" -> "➕ Thêm/Sửa Đám" để tạo đám nhanh nhé!`,
      { reply_markup: buildMainKeyboard() }
    );
    return;
  }

  const haThuyRow = objs.find((o) => o.tinhHinh === "Hạ thủy");
  const cotHauRows = objs.filter((o) => o.tinhHinh === "Cột hàu");
  let mocText = "";
  if (haThuyRow) {
    const kc = diffDays(haThuyRow.date, ymd(kst()));
    mocText += `🚢 Tàu hạ thủy: ${haThuyRow.date} (được ${kc} ngày)\n`;
  }
  if (cotHauRows.length) {
    const dates = cotHauRows.map((r) => r.date).join(", ");
    mocText += `🦪 Cột hàu: ${dates}\n`;
  }

  let text = `🌊 TÌNH HÌNH CÁC ĐÁM - VỤ MÙA ${getSeasonDisplay()}\n${mocText}\n`;

  for (const dam of dams) {
    const cfg = DAMS_CONFIG[dam];
    const st = computeBaiState(objs, dam);
    const thuocSt = computeThuocState(objs, dam);

    text += `📍 Bãi/Đám ${dam} [${cfg.loaiLuoi} - ${cfg.soDay} đường]:\n`;
    if (cfg.note) {
      text += `  • Chi tiết: ${cfg.note}\n`;
    }

    if (cfg.ngayTha) {
      const kcTha = diffDays(cfg.ngayTha, ymd(kst()));
      text += `  • Thả lưới: ${cfg.ngayTha} (${kcTha} ngày trước)\n`;
    } else {
      text += `  • Thả lưới: Đang trên bãi\n`;
    }

    if (cfg.ngayTach) {
      text += `  • Tách lưới: ${cfg.ngayTach}\n`;
    }

    if (thuocSt.progress > 0) {
      text += `  • Đi thuốc: ⏳ Đang dỡ ${thuocSt.progress}/${thuocSt.max} đường (còn ${thuocSt.remain}đ | gần nhất: ${thuocSt.lastAnyDate})\n`;
    } else if (thuocSt.lastCleanDate || cfg.ngayThuocCuoi) {
      const dThuoc = thuocSt.lastCleanDate || cfg.ngayThuocCuoi;
      const kcThuoc = diffDays(dThuoc, ymd(kst()));
      text += `  • Đi thuốc lần cuối: ${dThuoc} (${kcThuoc} ngày trước)\n`;
    } else {
      text += `  • Đi thuốc: Chưa đi thuốc\n`;
    }

    if (st.cleanDone > 0 || st.progress > 0) {
      text += `  • Thu hoạch: Đang ở VÒNG ${st.currentVong} (${st.progress}/${st.max} dây)\n`;
      if (st.lastCleanDate) {
        const fc = addDaysYmd(st.lastCleanDate, CUT_INTERVAL_DAYS);
        text += `    ⤷ Dự kiến cắt lại: ${fc}\n`;
      }
    } else {
      text += `  • Thu hoạch: Chưa cắt đợt nào\n`;
    }
    text += "\n";
  }

  // KABEKI đặt ở PHÍA DƯỚI CÙNG
  if (kbkCfg) {
    text += `----------------------------------\n`;
    text += `🕸️ KABEKI (Lưới 5 - Chờ tách):\n`;
    text += `  • Tổng thả biển (giữ nguyên): ${kbkStats.totalKbk} kabeki (= ${kbkStats.totalLines} đường lưới)\n`;
    if (kbkStats.splitKbk > 0) {
      text += `  • Đã tách: ${kbkStats.splitKbk} kabeki (chuyển ${kbkStats.movedLines} đường | ở lại gốc ${kbkStats.stayLines} đường)\n`;
      text += `  • Chờ tách: ${kbkStats.remainKbk} kabeki\n`;
    }
    if (kbkCfg.ngayThuocCuoi) {
      const kcThuocKbk = diffDays(kbkCfg.ngayThuocCuoi, ymd(kst()));
      text += `  • Đi thuốc Kabeki gần nhất: ${kbkCfg.ngayThuocCuoi} (${kcThuocKbk} ngày trước)\n`;
    } else {
      text += `  • Đi thuốc Kabeki: Chưa đi thuốc\n`;
    }
  }

  const inline_keyboard = [
    [
      { text: "💊 Đi thuốc nhanh", callback_data: "SHOW:THUOC_MENU" },
      { text: "🕸️ Tách lưới nhanh", callback_data: "SHOW:TACH_MENU" },
    ],
    [
      { text: "📆 Xem lịch cắt", callback_data: "SHOW:CUT_SCHEDULE" },
      { text: "🔄 Làm mới", callback_data: "SHOW:STATUS_MENU" },
    ],
  ];

  await send(chatId, text.trim(), {
    reply_markup: { inline_keyboard },
  });
}

async function reportThuocStatus(chatId) {
  const rows = await getSeasonDataRows();
  const objs = sortByDateTs(rows.map(rowToObj));
  const dams = getActiveDams();

  if (!dams.length) {
    await send(chatId, "💊 Chưa có bãi/đám nào để theo dõi đi thuốc.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  let text = `💊 TÌNH HÌNH ĐI THUỐC CÁC ĐÁM - VỤ ${getSeasonDisplay()}\n\n`;
  const todayYmd = ymd(kst());

  for (const dam of dams) {
    const cfg = DAMS_CONFIG[dam];
    const st = computeThuocState(objs, dam);
    const thuocHistory = objs.filter((o) => o.bai === dam && isThuocRow(o));

    text += `📍 Bãi ${dam} (${cfg?.soDay || st.max} đường):\n`;

    if (st.progress > 0) {
      text += `  • Trạng thái: ⏳ Đang đi dỡ ${st.progress}/${st.max} đường (còn ${st.remain}đ)\n`;
    }

    if (st.lastCleanDate || cfg?.ngayThuocCuoi) {
      const lastD = st.lastCleanDate || cfg.ngayThuocCuoi;
      const kc = diffDays(lastD, todayYmd);
      text += `  • Đi thuốc sạch gần nhất: ${lastD} (${kc === 0 ? "Hôm nay" : `${kc} ngày trước`})\n`;
    } else if (thuocHistory.length === 0) {
      text += `  • Chưa đi thuốc lần nào\n`;
    }

    if (thuocHistory.length > 0) {
      const recentList = thuocHistory
        .slice(-5)
        .map((o) => {
          const ddmm = o.date ? `${o.date.slice(8, 10)}/${o.date.slice(5, 7)}` : "";
          return o.tinhHinh === "Đi thuốc dỡ" ? `${ddmm}(dỡ ${o.dayG}đ)` : ddmm;
        })
        .join(" → ");
      text += `  • Lịch sử gần đây: ${recentList}\n`;
    }
    text += "\n";
  }

  const inline_keyboard = [
    [
      { text: "💊 Ghi nhận ĐI THUỐC ngay", callback_data: "SHOW:THUOC_MENU" },
      { text: "✏️ Sửa ngày đi thuốc", callback_data: "SHOW:EDIT_LIST" },
    ],
  ];

  await send(chatId, text.trim(), { reply_markup: { inline_keyboard } });
}

function buildCalendarKeyboard(rowNum, year, month) {
  // month: 1..12
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const nextY = month === 12 ? year + 1 : year;

  const today = kst();
  const todayY = today.getUTCFullYear();
  const todayM = today.getUTCMonth() + 1;
  const todayD = today.getUTCDate();

  const inline_keyboard = [
    [
      { text: "⬅️ Tháng trước", callback_data: `CAL_VIEW:${rowNum}:${prevY}:${prevM}` },
      { text: `📅 Tháng ${String(month).padStart(2, "0")}/${year}`, callback_data: "NOOP" },
      { text: "Tháng sau ➡️", callback_data: `CAL_VIEW:${rowNum}:${nextY}:${nextM}` },
    ],
  ];

  let row = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = year === todayY && month === todayM && d === todayD;
    const label = isToday ? `[${d}]` : String(d).padStart(2, "0");
    const ymdVal = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    row.push({ text: label, callback_data: `CAL_PICK:${rowNum}:${ymdVal}` });
    if (row.length === 7) {
      inline_keyboard.push(row);
      row = [];
    }
  }
  if (row.length > 0) inline_keyboard.push(row);

  inline_keyboard.push([
    { text: "❌ Hủy", callback_data: "CANCEL_ACTION" },
  ]);

  return { inline_keyboard };
}

async function reportCutSchedule(chatId) {
  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);
  const dams = getActiveDams();

  if (!dams.length) {
    await send(chatId, "📆 Chưa có dữ liệu đám/bãi nào.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const items = [];
  for (const dam of dams) {
    const st = computeBaiState(objs, dam);
    const forecast = st.lastCleanDate
      ? addDaysYmd(st.lastCleanDate, CUT_INTERVAL_DAYS)
      : "";

    if (!forecast) {
      items.push({ dam, forecast: "", sortKey: Infinity });
    } else {
      const [dd, mm, yyyy] = forecast.split("/");
      const t = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`).getTime();
      items.push({ dam, forecast, sortKey: t });
    }
  }

  items.sort((a, b) => a.sortKey - b.sortKey);

  let out = `📆 LỊCH CẮT DỰ KIẾN CÁC ĐÁM\n(Theo lần CẮT SẠCH gần nhất + ${CUT_INTERVAL_DAYS} ngày)\n`;
  for (const it of items) {
    const cfg = DAMS_CONFIG[it.dam];
    const loai = cfg?.loaiLuoi ? ` (${cfg.loaiLuoi})` : "";
    if (!it.forecast) {
      out += `\n• Đám ${it.dam}${loai}: (Chưa có dữ liệu cắt sạch)`;
    } else {
      out += `\n• Đám ${it.dam}${loai}: ➡️ ${it.forecast}`;
    }
  }

  await send(chatId, out.trim(), { reply_markup: buildMainKeyboard() });
}

async function reportMonth(chatId) {
  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);

  const now = kst();
  const monthKey = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, "0")}`;

  const workDays = new Set();
  const stormDays = new Set();
  const windDays = new Set();
  const shoreDays = new Set();
  let totalWon = 0;
  let totalBao = 0;

  for (const o of objs) {
    if (!o.date || o.date.slice(0, 7) !== monthKey) continue;

    if (o.won > 0) {
      workDays.add(o.date);
      totalWon += o.won;
      totalBao += o.baoTau;
    } else {
      const t = (o.tinhHinh || "").toLowerCase();
      if (t.includes("bão") || t.includes("bao")) stormDays.add(o.date);
      else if (t.includes("nghỉ gió") || t.includes("gio")) windDays.add(o.date);
      else if (t.includes("làm bờ") || t.includes("bo")) shoreDays.add(o.date);
    }
  }

  const text =
`📅 THỐNG KÊ THÁNG ${monthKey}
[Vụ mùa: ${getSeasonDisplay()}]

• Số ngày đi làm: ${workDays.size} ngày
• Tránh bão: ${stormDays.size} ngày
• Nghỉ gió: ${windDays.size} ngày
• Làm bờ: ${shoreDays.size} ngày
----------------------------------
📦 Tổng sản lượng: ${totalBao} bao lớn (≈ ${baoChuan(totalBao)} bao chuẩn)
💵 Doanh thu tháng: ${Number(totalWon).toLocaleString()} ₩ (${moneyToTrieu(totalWon)})`.trim();

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

async function reportByVong(chatId) {
  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);
  const withV = assignVongAll(objs);

  const sumByV = new Map();
  const sumByBaiV = new Map();

  for (const o of withV) {
    if (!isWorkRow(o) || o.vong <= 0) continue;
    sumByV.set(o.vong, (sumByV.get(o.vong) || 0) + (o.won || 0));
    const key = `${o.bai}|${o.vong}`;
    sumByBaiV.set(key, (sumByBaiV.get(key) || 0) + (o.won || 0));
  }

  const vongs = [...sumByV.entries()].sort((a, b) => a[0] - b[0]);
  let out = `🔁 THỐNG KÊ THEO VÒNG [Vụ: ${getSeasonDisplay()}]\n`;
  if (!vongs.length) out += "\n(Chưa có dữ liệu thu hoạch)";
  for (const [v, won] of vongs) {
    out += `\n• Vòng ${v}: ${Number(won).toLocaleString()} ₩ (${moneyToTrieu(won)})`;
  }

  out += "\n\nChi tiết theo từng đám:";
  const list = [...sumByBaiV.entries()]
    .map(([k, won]) => {
      const [bai, v] = k.split("|");
      return { bai, vong: Number(v), won };
    })
    .sort((a, b) => (a.bai + a.vong).localeCompare(b.bai + b.vong));

  if (!list.length) out += "\n(Chưa có dữ liệu)";
  for (const it of list) {
    out += `\n- Đám ${it.bai}: V${it.vong}: ${Number(it.won).toLocaleString()} ₩`;
  }

  await send(chatId, out.trim(), { reply_markup: buildMainKeyboard() });
}

async function reportSeasonTotal(chatId) {
  const rows = await getSeasonDataRows();
  const objs = rows.map(rowToObj);

  let totalWon = 0;
  let totalBao = 0;

  for (const o of objs) {
    if (o.won > 0) {
      totalWon += o.won;
      totalBao += o.baoTau;
    }
  }

  const legacyRows = await getLegacyDataRows();
  const legacyWon = legacyRows.reduce((s, r) => s + (Number(r?.[10]) || 0), 0);

  const text =
`💰 TỔNG THU HOẠCH VỤ MÙA ${getSeasonDisplay()}
• Tổng số bao lớn: ${totalBao.toLocaleString()} bao
• Tổng số bao chuẩn: ${baoChuan(totalBao).toLocaleString()} bao
• TỔNG THU NHẬP: ${totalWon.toLocaleString()} ₩ (${moneyToTrieu(totalWon)})
----------------------------------
📂 Doanh thu Vụ cũ (năm ngoái): ${legacyWon.toLocaleString()} ₩ (${moneyToTrieu(legacyWon)})
(Bấm nút "📂 XEM DỮ LIỆU VỤ CŨ" để xem chi tiết lịch sử năm ngoái)`.trim();

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

async function reportCommandList(chatId) {
  const rows = await getSeasonDataRows();
  const objs = rows
    .map(rowToObj)
    .filter((o) => o.bai && o.baoTau > 0 && o.giaK > 0 && o.won > 0);

  if (!objs.length) {
    const legacyRows = await getLegacyDataRows();
    const legacyObjs = legacyRows
      .map(rowToObj)
      .filter((o) => o.bai && o.baoTau > 0 && o.giaK > 0 && o.won > 0);

    let out = `📋 Vụ mùa mới ${getSeasonDisplay()} chưa có lệnh cắt nào.\n\n📂 10 LỆNH GẦN NHẤT TỪ VỤ CŨ (TAB DATA):\n`;
    legacyObjs.slice(-10).forEach((o) => {
      out += `• ${o.date}: ${o.bai} ${o.baoTau}b ${o.giaK}k (${o.tinhHinh})\n`;
    });
    out += `\n(Bấm nút "📂 XEM DỮ LIỆU VỤ CŨ" để xem toàn bộ danh sách năm ngoái)`;

    await send(chatId, out.trim(), {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  let out = `📋 DANH SÁCH LỆNH CẮT ĐÃ GỬI [Vụ ${getSeasonDisplay()}]:\n\n`;
  objs.slice(-30).forEach((o) => {
    out += `• ${o.date}: ${o.bai} ${o.baoTau}b ${o.giaK}k (${o.tinhHinh})\n`;
  });

  await send(chatId, out.trim(), { reply_markup: buildMainKeyboard() });
}

async function sendHelp(chatId) {
  const text =
`ℹ️ HƯỚNG DẪN SỬ DỤNG SỔ KIM (VỤ MÙA ${getSeasonDisplay()})

💡 Mẹo: Hầu hết chức năng (Đi thuốc, Tách lưới, Tránh bão, Hạ thủy, Xóa) bạn chỉ cần BẤM NÚT TRÊN MÀN HÌNH là xong, không cần gõ lệnh!

1. KHI CẮT KIM (THU HOẠCH):
• Cắt sạch: A 60b 220k
• Cắt dỡ: A 30g 40b 220k
• Ghi bù ngày: A 60b 220k 15d
• Nhiều đám 1 lúc: A B 100b 250k
• Cắt tiếp đợt trước: Tiep A B 90b 320k

2. QUẢN LÝ ĐÁM:
• them dam <Tên> <Loại: nm/tn/so> [SốDây]
• sua day <Tên> <SốDâyMới>
• sua <cú pháp mới> (Sửa dòng cắt gần nhất)
• Xóa: Bấm nút "Xóa dòng gần nhất" và chọn nút Xác nhận.`.trim();

  await send(chatId, text, { reply_markup: buildMainKeyboard() });
}

/* ================== QUẢN LÝ SỬA / XÓA NÂNG CAO ================== */
const pendingEdit = new Map();
function setPendingEdit(chatId, payload) {
  pendingEdit.set(String(chatId), {
    ...payload,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}
function getPendingEdit(chatId) {
  const p = pendingEdit.get(String(chatId));
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    pendingEdit.delete(String(chatId));
    return null;
  }
  return p;
}
function clearPendingEdit(chatId) {
  pendingEdit.delete(String(chatId));
}

async function syncDamLatestDatesFromData(dam) {
  const damU = String(dam || "").trim().toUpperCase();
  if (!damU || damU === "TOÀN TÀU") return;
  if (!DAMS_CONFIG[damU]) return;

  const rows = await getSeasonDataRows();
  const objs = sortByDateTs(rows.map(rowToObj)).filter((o) => o.bai === damU);

  let latestThuoc = "";
  let latestTach = "";
  for (const o of objs) {
    if ((o.tinhHinh === "Đi thuốc" || o.tinhHinh === "Đi thuốc sạch") && o.date) {
      latestThuoc = o.date;
    }
    if (o.tinhHinh && o.tinhHinh.includes("Tách") && o.date) latestTach = o.date;
  }

  await upsertDamConfig(damU, {
    ngayThuocCuoi: latestThuoc,
    ngayTach: latestTach,
  });
}

async function showEditDeleteListMenu(chatId) {
  const rows = await getSeasonDataRows();
  const recent = [];
  for (let i = rows.length - 1; i >= 0 && recent.length < 6; i--) {
    const o = rowToObj(rows[i]);
    if (o.ts || o.date || o.bai || o.tinhHinh) {
      recent.push({ rowNum: 2 + i, o });
    }
  }

  if (!recent.length) {
    await send(chatId, "📋 Chưa có dữ liệu nào để sửa hoặc xóa.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const inline_keyboard = recent.map(({ rowNum, o }, idx) => {
    const extra = o.baoTau > 0 ? ` ${o.baoTau}b ${o.giaK}k` : "";
    const label = `${idx + 1}. [${o.date}] ${o.tinhHinh} ${o.bai}${extra}`.slice(0, 58);
    return [{ text: label, callback_data: `PICK_ROW:${rowNum}` }];
  });

  await send(
    chatId,
    "✏️ SỬA / 🗑️ XÓA DỮ LIỆU\nChọn 1 dòng bên dưới để sửa (ngày, bao, giá, dây) hoặc xóa:",
    { reply_markup: { inline_keyboard } }
  );
}

async function applyEditRowDate(rowNumber1Based, newDateYmd, chatId) {
  const rows = await getSeasonDataRows();
  const idx0 = rowNumber1Based - 2;
  if (idx0 < 0 || idx0 >= rows.length || !rows[idx0]) {
    await send(chatId, "⚠️ Không tìm thấy dòng cần sửa.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const oldRow = [...rows[idx0]];
  while (oldRow.length < 12) oldRow.push("");
  oldRow[1] = newDateYmd; // Cột B: Date

  await updateSeasonDataRow(rowNumber1Based, oldRow);
  const o = rowToObj(oldRow);
  await syncDamLatestDatesFromData(o.bai);

  await send(
    chatId,
    `✅ ĐÃ CẬP NHẬT NGÀY THÀNH CÔNG!\n• Dòng: ${o.tinhHinh} ${o.bai}\n• Ngày mới: ${newDateYmd}`,
    { reply_markup: buildMainKeyboard() }
  );
}

async function applyEditRowWork(rowNumber1Based, parsed, chatId, userName) {
  const rows = await getSeasonDataRows();
  const idx0 = rowNumber1Based - 2;
  if (idx0 < 0 || idx0 >= rows.length || !rows[idx0]) {
    await send(chatId, "⚠️ Không tìm thấy dòng cần sửa.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const oldObj = rowToObj(rows[idx0]);
  const objs = rows.map(rowToObj);
  const objsBefore = objs.filter((_, i) => i < idx0);

  const damU = (parsed.bai || oldObj.bai).toUpperCase();
  const dateYmd = parsed.dateToken
    ? ymd(parseCustomDate(parsed.dateToken, true))
    : oldObj.date;

  const { max, newProgress, tinhHinh, vong } = buildWorkProgress({
    allObjs: objsBefore,
    bai: damU,
    gDelta: parsed.gDelta,
  });

  const bc = baoChuan(parsed.b);
  const won = bc * parsed.k * 1000;

  const newRow = [
    oldObj.ts || new Date().toISOString(),
    dateYmd,
    userName || oldObj.thu,
    damU,
    newProgress,
    max,
    tinhHinh,
    parsed.b,
    bc,
    parsed.k,
    won,
    parsed.note || oldObj.note || "",
  ];

  await updateSeasonDataRow(rowNumber1Based, newRow);

  await send(
    chatId,
    `✏️ ĐÃ SỬA LỆNH CẮT THÀNH CÔNG (Vòng ${vong}):\n📅 Ngày: ${dateYmd}\n📍 Bãi: ${damU}\n✂️ Tình hình: ${tinhHinh} (${newProgress}/${max} dây)\n📦 Sản lượng: ${parsed.b} bao (≈ ${bc} bao chuẩn)\n💰 Giá: ${parsed.k}k\n💵 THU: ${won.toLocaleString()} ₩`,
    { reply_markup: buildMainKeyboard() }
  );
}

function findLastRowIndexAny(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = rowToObj(rows[i]);
    if (o.ts || o.date || o.thu || o.bai || o.tinhHinh) return 2 + i;
  }
  return null;
}

function findLastWorkRowIndexForUserAndBai(rows, userName, bai) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = rowToObj(rows[i]);
    if (o.thu === userName && o.bai === bai && isWorkRow(o)) return 2 + i;
  }
  return null;
}

/* ================== XỬ LÝ CALLBACK QUERY (KHI NGƯỜI DÙNG BẤM NÚT INLINE) ================== */
async function handleCallbackQuery(cb) {
  const chatId = cb.message?.chat?.id;
  const data = cb.data || "";
  const userName = cb.from?.first_name || "Bạn";

  await tg("answerCallbackQuery", {
    callback_query_id: cb.id,
    text: "⚡ Đang xử lý...",
  });

  if (!chatId) return;

  // Chọn bãi đi thuốc -> hiện Đi sạch hoặc Đi dỡ
  if (data.startsWith("THUOC_PICK:")) {
    const dam = data.split(":")[1];
    const rows = await getSeasonDataRows();
    const st = computeThuocState(rows.map(rowToObj), dam);
    const cleanBtnText =
      st.progress > 0
        ? `✅ Đi nốt phần còn lại (${st.remain}đ)`
        : `✅ Đi sạch hết (${st.max}đ)`;

    const inline_keyboard = [
      [{ text: cleanBtnText, callback_data: `THUOC_CLEAN:${dam}` }],
      [{ text: "✂️ Đi dỡ (nhập số đường)", callback_data: `THUOC_PARTIAL_ASK:${dam}` }],
      [{ text: "⬅️ Chọn bãi khác", callback_data: "SHOW:THUOC_MENU" }],
    ];

    const infoLine =
      st.progress > 0
        ? `\n⏳ Hiện đang đi dỡ: ${st.progress}/${st.max} đường (còn ${st.remain}đ)`
        : "";

    await send(
      chatId,
      `💊 ĐI THUỐC BÃI ${dam} (Tổng ${st.max} đường)${infoLine}\nChọn hình thức bên dưới:`,
      { reply_markup: { inline_keyboard } }
    );
    return;
  }

  if (data.startsWith("THUOC_CLEAN:")) {
    const dam = data.split(":")[1];
    clearPendingEdit(chatId);
    await recordDiThuoc([dam], kst(), chatId, userName, null);
    return;
  }

  if (data.startsWith("THUOC_PARTIAL_ASK:")) {
    const dam = data.split(":")[1];
    const rows = await getSeasonDataRows();
    const st = computeThuocState(rows.map(rowToObj), dam);
    setPendingEdit(chatId, { mode: "THUOC_PARTIAL", bai: dam });
    await send(
      chatId,
      `💊 ĐI THUỐC DỠ BÃI ${dam} (còn ${st.remain}/${st.max} đường)\nNhập số đường hôm nay đã đi thuốc (VD: 30 hoặc 30 15/11):`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Hủy", callback_data: "CANCEL_ACTION" }]],
        },
      }
    );
    return;
  }

  // Đi thuốc trực tiếp (tương thích cũ)
  if (data.startsWith("THUOC:")) {
    const target = data.split(":")[1];
    await recordDiThuoc([target], kst(), chatId, userName, null);
    return;
  }

  // Tách Kabeki nhanh
  if (data.startsWith("KABEKI_TACH:")) {
    const soKbk = Number(data.split(":")[1] || 0);
    await recordTachKabeki(soKbk, null, kst(), chatId, userName);
    return;
  }

  // Tách lưới
  if (data.startsWith("TACH:")) {
    const dam = data.split(":")[1];
    await recordTachLuoi(dam, kst(), chatId, userName);
    return;
  }

  // Nghỉ biển
  if (data.startsWith("NGHI:")) {
    const parts = data.split(":");
    const type = parts[1]; // BAO / GIO / BO
    const days = Number(parts[2] || 1);
    await recordNghiBien(type, days, kst(), chatId, userName);
    return;
  }

  // Hạ thủy
  if (data === "HATHUY:TODAY") {
    await recordHaThuy(kst(), chatId, userName);
    return;
  }

  // Thả lưới nhanh
  if (data.startsWith("THA:")) {
    const parts = data.split(":");
    const dam = parts[1];
    await recordThaLuoi(dam, "Lưới Nhà Máy", DEFAULT_NHA_MAY_DAY, kst(), chatId, userName);
    return;
  }

  // Thêm đám nhanh
  if (data.startsWith("ADD_DAM:")) {
    const parts = data.split(":");
    const dam = parts[1];
    const soDay = Number(parts[2] || 180);
    await upsertDamConfig(dam, { loaiLuoi: "Lưới Nhà Máy", soDay });
    await send(
      chatId,
      `✅ Đã tạo Đám ${dam} (Lưới Nhà Máy - ${soDay} dây).`,
      { reply_markup: buildMainKeyboard() }
    );
    return;
  }

  // Xóa dòng gần nhất
  if (data === "CONFIRM_DEL_LAST") {
    const rows = await getSeasonDataRows();
    const idx = findLastRowIndexAny(rows);
    if (!idx) {
      await send(chatId, "⚠️ Không có dữ liệu để xóa.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }
    await clearSeasonDataRow(idx);
    await send(chatId, "✅ Đã xóa dòng gần nhất thành công.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  if (data === "CANCEL_ACTION") {
    clearPendingEdit(chatId);
    await send(chatId, "❌ Đã hủy thao tác.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  // Thống kê mùa vụ hub callbacks
  if (data === "STATS:MONTH") return reportMonth(chatId);
  if (data === "STATS:VONG") return reportByVong(chatId);
  if (data === "STATS:SEASON") return reportSeasonTotal(chatId);
  if (data === "STATS:COMMANDS") return reportCommandList(chatId);
  if (data === "STATS:HELP") return sendHelp(chatId);
  if (data === "STATS:HATHUY") return showHaThuyMenu(chatId);
  if (data === "STATS:ADDDAM") return showAddDamMenu(chatId);

  // Sửa / Xóa nâng cao callbacks
  if (data === "SHOW:EDIT_LIST") return showEditDeleteListMenu(chatId);

  if (data.startsWith("PICK_ROW:")) {
    const rowNum = Number(data.split(":")[1]);
    const rows = await getSeasonDataRows();
    const idx0 = rowNum - 2;
    if (idx0 < 0 || idx0 >= rows.length || !rows[idx0]) {
      await send(chatId, "⚠️ Dòng này không còn tồn tại.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }
    const o = rowToObj(rows[idx0]);
    const isCut = isWorkRow(o);
    const inline_keyboard = [
      [{ text: "📅 Sửa Ngày", callback_data: `EDIT_DATE_PICK:${rowNum}` }],
    ];
    if (isCut) {
      inline_keyboard[0].push({
        text: "📦 Sửa Bao / Giá / Dây",
        callback_data: `EDIT_WORK_ASK:${rowNum}`,
      });
    }
    inline_keyboard.push([
      { text: "🗑️ Xóa dòng này", callback_data: `DEL_ROW_ASK:${rowNum}` },
      { text: "⬅️ Quay lại", callback_data: "SHOW:EDIT_LIST" },
    ]);

    const detail = isCut
      ? `${o.tinhHinh} ${o.bai} (${o.dayG}/${o.maxG} dây) - ${o.baoTau}b ${o.giaK}k`
      : `${o.tinhHinh} ${o.bai} ${o.note ? `(${o.note})` : ""}`;

    await send(
      chatId,
      `📌 ĐANG CHỌN DÒNG:\n📅 Ngày: ${o.date}\n📝 Nội dung: ${detail}\n\nBạn muốn làm gì với dòng này?`,
      { reply_markup: { inline_keyboard } }
    );
    return;
  }

  if (data === "NOOP") return;

  if (data.startsWith("EDIT_DATE_PICK:")) {
    const rowNum = Number(data.split(":")[1]);
    setPendingEdit(chatId, { mode: "EDIT_DATE", rowNumber1Based: rowNum });
    const now = kst();
    const cal = buildCalendarKeyboard(rowNum, now.getUTCFullYear(), now.getUTCMonth() + 1);
    await send(
      chatId,
      "📅 CHỌN NGÀY MỚI TRÊN LỊCH:\nBấm thẳng vào ngày bạn muốn sửa (hoặc đổi tháng bằng nút ⬅️ / ➡️):",
      { reply_markup: cal }
    );
    return;
  }

  if (data.startsWith("CAL_VIEW:")) {
    const parts = data.split(":");
    const rowNum = Number(parts[1]);
    const y = Number(parts[2]);
    const m = Number(parts[3]);
    const cal = buildCalendarKeyboard(rowNum, y, m);
    await tg("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: cb.message?.message_id,
      reply_markup: cal,
    });
    return;
  }

  if (data.startsWith("CAL_PICK:")) {
    const parts = data.split(":");
    const rowNum = Number(parts[1]);
    const pickedYmd = parts[2];
    clearPendingEdit(chatId);
    await applyEditRowDate(rowNum, pickedYmd, chatId);
    return;
  }

  if (data.startsWith("SET_DATE:")) {
    const parts = data.split(":");
    const rowNum = Number(parts[1]);
    const daysAgo = Number(parts[2] || 0);
    clearPendingEdit(chatId);
    const d = new Date(kst().getTime() - daysAgo * 86400000);
    await applyEditRowDate(rowNum, ymd(d), chatId);
    return;
  }

  if (data.startsWith("EDIT_WORK_ASK:")) {
    const rowNum = Number(data.split(":")[1]);
    const rows = await getSeasonDataRows();
    const o = rowToObj(rows[rowNum - 2]);
    setPendingEdit(chatId, {
      mode: "EDIT_WORK",
      rowNumber1Based: rowNum,
      bai: o.bai,
      dateYmd: o.date,
    });
    await send(
      chatId,
      `✏️ SỬA LỆNH CẮT (${o.bai} - ${o.date})\nNhập số liệu mới vào ô chat (không cần gõ lại tên bãi nếu không đổi):\n• VD cắt sạch: 50b 220k\n• VD cắt dỡ: 30g 40b 210k`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Hủy", callback_data: "CANCEL_ACTION" }]],
        },
      }
    );
    return;
  }

  if (data.startsWith("DEL_ROW_ASK:")) {
    const rowNum = Number(data.split(":")[1]);
    await send(chatId, "⚠️ Bạn chắc chắn muốn XÓA dòng này chứ?", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ XÁC NHẬN XÓA", callback_data: `DEL_ROW_DO:${rowNum}` },
            { text: "❌ Hủy", callback_data: "CANCEL_ACTION" },
          ],
        ],
      },
    });
    return;
  }

  if (data.startsWith("DEL_ROW_DO:")) {
    const rowNum = Number(data.split(":")[1]);
    const rows = await getSeasonDataRows();
    const idx0 = rowNum - 2;
    const oldBai = idx0 >= 0 && rows[idx0] ? rowToObj(rows[idx0]).bai : "";
    await clearSeasonDataRow(rowNum);
    if (oldBai) await syncDamLatestDatesFromData(oldBai);
    await send(chatId, "✅ Đã xóa dòng vừa chọn thành công!", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  // Menu redirects
  if (data === "SHOW:THUOC_MENU") return showThuocMenu(chatId);
  if (data === "SHOW:TACH_MENU") return showTachLuoiMenu(chatId);
  if (data === "SHOW:CUT_SCHEDULE") return reportCutSchedule(chatId);
  if (data === "SHOW:STATUS_MENU") return reportAllDamsStatus(chatId);
  if (data === "SHOW:LEGACY_SEASON") return reportLegacySeason(chatId);
}

/* ================== XỬ LÝ TIN NHẮN TEXT ================== */
async function handleTextMessage(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const userName = msg.from?.first_name || "Bạn";
  const textRaw = (msg.text || "").trim();

  // Xác nhận xóa bằng mã 2525 (dự phòng)
  if (textRaw === CONFIRM_CODE) {
    const rows = await getSeasonDataRows();
    const idx = findLastRowIndexAny(rows);
    if (!idx) {
      await send(chatId, "Không có dữ liệu để xóa.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }
    const oldBai = rowToObj(rows[idx - 2]).bai;
    await clearSeasonDataRow(idx);
    if (oldBai) await syncDamLatestDatesFromData(oldBai);
    await send(chatId, "✅ Đã xóa dòng gần nhất.", {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  // ====== NÚT BẤM MENU DƯỚI KHUNG CHAT ======
  const menuButtons = new Set([
    "/start",
    "📋 Tình hình các đám",
    "💊 Tình hình đi thuốc",
    "📆 Lịch cắt các đám",
    "💊 Ghi nhận ĐI THUỐC",
    "🕸️ Ghi nhận TÁCH LƯỚI",
    "📊 THỐNG KÊ MÙA VỤ",
    "✏️ Sửa / 🗑️ Xóa dữ liệu",
    "📅 Thống kê tháng này",
    "🔁 Thống kê theo VÒNG",
    "💰 TỔNG THU VỤ MÙA",
    "📋 Lệnh cắt đã gửi",
    "📂 XEM DỮ LIỆU VỤ CŨ",
    "ℹ️ Hướng dẫn cú pháp",
    "🚢 Mốc Hạ thủy / Thả lưới",
    "🌀 Tránh bão / Nghỉ gió",
    "➕ Thêm/Sửa Đám & Lưới",
  ]);

  if (menuButtons.has(textRaw)) {
    clearPendingEdit(chatId);
  }

  if (textRaw === "/start") {
    await send(
      chatId,
      `🌊 SỔ KIM SẴN SÀNG - VỤ MÙA ${getSeasonDisplay()}!\nĐã tải ${
        getActiveDams().length
      } bãi cắt + kho Kabeki.\nBấm biểu tượng ô vuông ⊞ bên cạnh ô chat để mở menu khi cần (menu tự ẩn để dễ đọc).`,
      { reply_markup: buildMainKeyboard() }
    );
    return;
  }

  if (textRaw === "📋 Tình hình các đám") return reportAllDamsStatus(chatId);
  if (textRaw === "💊 Tình hình đi thuốc") return reportThuocStatus(chatId);
  if (textRaw === "📆 Lịch cắt các đám") return reportCutSchedule(chatId);
  if (textRaw === "💊 Ghi nhận ĐI THUỐC") return showThuocMenu(chatId);
  if (textRaw === "🕸️ Ghi nhận TÁCH LƯỚI") return showTachLuoiMenu(chatId);
  if (textRaw === "📊 THỐNG KÊ MÙA VỤ") return showStatsHubMenu(chatId);
  if (textRaw === "✏️ Sửa / 🗑️ Xóa dữ liệu") return showEditDeleteListMenu(chatId);

  // Vẫn hỗ trợ nếu bấm/gõ tên nút cũ
  if (textRaw === "📅 Thống kê tháng này") return reportMonth(chatId);
  if (textRaw === "🔁 Thống kê theo VÒNG") return reportByVong(chatId);
  if (textRaw === "💰 TỔNG THU VỤ MÙA") return reportSeasonTotal(chatId);
  if (textRaw === "📋 Lệnh cắt đã gửi") return reportCommandList(chatId);
  if (textRaw === "📂 XEM DỮ LIỆU VỤ CŨ") return reportLegacySeason(chatId);
  if (textRaw === "ℹ️ Hướng dẫn cú pháp") return sendHelp(chatId);
  if (textRaw === "🚢 Mốc Hạ thủy / Thả lưới") return showHaThuyMenu(chatId);
  if (textRaw === "🌀 Tránh bão / Nghỉ gió") return showNghiBienMenu(chatId);
  if (textRaw === "➕ Thêm/Sửa Đám & Lưới") return showAddDamMenu(chatId);

  // ====== XỬ LÝ TRẠNG THÁI CHỜ SỬA (PENDING EDIT) ======
  const pEdit = getPendingEdit(chatId);
  if (pEdit) {
    if (pEdit.mode === "EDIT_DATE") {
      const d = parseCustomDate(textRaw, false);
      clearPendingEdit(chatId);
      return applyEditRowDate(pEdit.rowNumber1Based, ymd(d), chatId);
    }
    if (pEdit.mode === "THUOC_PARTIAL") {
      const parts = textRaw.split(/\s+/);
      let gDelta = null;
      let dateToken = null;
      for (const p of parts) {
        if (/^\d+g$/i.test(p)) gDelta = Number(p.slice(0, -1));
        else if (/^\d+$/.test(p) && !gDelta) gDelta = Number(p);
        else if (/^\d+d$/i.test(p) || /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(p)) {
          dateToken = p;
        }
      }
      if (!gDelta || gDelta <= 0) {
        await send(
          chatId,
          "❌ Vui lòng nhập số đường đã đi thuốc (VD: 30 hoặc 30 15/11).",
          { reply_markup: buildMainKeyboard() }
        );
        return;
      }
      clearPendingEdit(chatId);
      const dateObj = parseCustomDate(dateToken, false);
      return recordDiThuoc([pEdit.bai], dateObj, chatId, userName, gDelta);
    }
    if (pEdit.mode === "EDIT_WORK") {
      const candidate = /^\d/.test(textRaw) ? `${pEdit.bai} ${textRaw}` : textRaw;
      const parsedEdit = parseWorkLine(candidate);
      if (!parsedEdit || parsedEdit.type !== "WORK") {
        await send(
          chatId,
          `❌ Cú pháp sửa chưa đúng. Hãy nhập dạng: 50b 220k hoặc 30g 40b 210k`,
          { reply_markup: buildMainKeyboard() }
        );
        return;
      }
      clearPendingEdit(chatId);
      return applyEditRowWork(pEdit.rowNumber1Based, parsedEdit, chatId, userName);
    }
  }

  if (textRaw === "✏️ Sửa dòng gần nhất") {
    await send(
      chatId,
      `✏️ SỬA DÒNG GẦN NHẤT\nBạn gõ: sua <cú pháp mới>\nVí dụ:\n• sua A 60b 220k\n• sua A 30g 40b 220k`,
      { reply_markup: buildMainKeyboard() }
    );
    return;
  }

  if (textRaw === "🗑️ Xóa dòng gần nhất") {
    const inline_keyboard = [
      [
        { text: "🗑️ XÁC NHẬN XÓA NGAY", callback_data: "CONFIRM_DEL_LAST" },
        { text: "❌ HỦY", callback_data: "CANCEL_ACTION" },
      ],
    ];
    await send(
      chatId,
      "⚠️ Bạn có chắc chắn muốn xóa dòng gần nhất không?",
      { reply_markup: { inline_keyboard } }
    );
    return;
  }

  // ====== LỆNH GÕ TEXT: KHỞI VỤ & KỸ THUẬT ======

  // Hạ thủy
  if (/^ha\s*thuy(\s+.*)?$/i.test(textRaw)) {
    const parts = textRaw.split(/\s+/);
    const dateToken = parts[2] || parts[1];
    const dateObj = parseCustomDate(dateToken, false);
    return recordHaThuy(dateObj, chatId, userName);
  }

  // Thả lưới
  if (/^tha\s*luoi\s+/i.test(textRaw)) {
    const body = textRaw.replace(/^tha\s*luoi\s+/i, "").trim();
    const parts = body.split(/\s+/);
    const dam = parts[0]?.toUpperCase() || "A";
    let loaiLuoi = "Lưới Nhà Máy";
    let soDay = DEFAULT_NHA_MAY_DAY;
    let dateToken = null;

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      if (/^(nm|nhamay|tn|tunhien|so|hao|luoiso)$/i.test(p)) {
        loaiLuoi = normalizeLoaiLuoi(p);
      } else if (/^\d+$/.test(p) && Number(p) > 0) {
        soDay = Number(p);
      } else if (/^\d+d$/i.test(p) || /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(p)) {
        dateToken = p;
      }
    }
    const dateObj = parseCustomDate(dateToken, false);
    return recordThaLuoi(dam, loaiLuoi, soDay, dateObj, chatId, userName);
  }

  // Thả thêm lưới vào bãi (VD: tha them A22 18 nm)
  if (/^tha\s*them\s+/i.test(textRaw)) {
    const body = textRaw.replace(/^tha\s*them\s+/i, "").trim();
    const parts = body.split(/\s+/);
    const dam = parts[0] || "";
    const addDay = Number(parts[1] || 0);
    const loaiStr = parts[2] || "";
    const dateObj = parseCustomDate(parts[3] || null, false);
    return recordThaThem(dam, addDay, loaiStr, dateObj, chatId, userName);
  }

  // Thả thêm Kabeki (VD: them kabeki 20)
  if (/^them\s*(?:kabeki|kbk)\s+/i.test(textRaw)) {
    const body = textRaw.replace(/^them\s*(?:kabeki|kbk)\s+/i, "").trim();
    const parts = body.split(/\s+/);
    const soKbk = Number(parts[0] || 0);
    const dateObj = parseCustomDate(parts[1] || null, false);
    return recordThemKabeki(soKbk, dateObj, chatId, userName);
  }

  // Tách Kabeki (VD: tach kabeki 10 A14 | tach kbk 10)
  if (/^(?:tach\s*(?:kabeki|kbk)|kbk)\s+/i.test(textRaw)) {
    const body = textRaw
      .replace(/^tach\s*(?:kabeki|kbk)\s+/i, "")
      .replace(/^kbk\s+/i, "")
      .trim();
    const parts = body.split(/\s+/);
    const soKbk = Number(parts[0] || 0);
    let targetDam = null;
    let dateToken = null;
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      if (/^\d+d$/i.test(p) || /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(p)) {
        dateToken = p;
      } else {
        targetDam = p;
      }
    }
    const dateObj = parseCustomDate(dateToken, false);
    return recordTachKabeki(soKbk, targetDam, dateObj, chatId, userName);
  }

  // Tách lưới
  if (/^(?:tach\s*luoi|tach)\s+/i.test(textRaw)) {
    const body = textRaw.replace(/^tach\s*luoi\s+/i, "").replace(/^tach\s+/i, "").trim();
    const parts = body.split(/\s+/);
    const dam = parts[0]?.toUpperCase() || "A";
    const dateObj = parseCustomDate(parts[1] || null, false);
    return recordTachLuoi(dam, dateObj, chatId, userName);
  }

  // Đi thuốc (hỗ trợ cả đi sạch và đi dỡ: thuoc A27 | thuoc A27 30 | thuoc A27 30g 15/11)
  if (/^(?:di\s*thuoc|thuoc)\s+/i.test(textRaw)) {
    const body = textRaw.replace(/^di\s*thuoc\s+/i, "").replace(/^thuoc\s+/i, "").trim();
    const parts = body.split(/\s+/);
    let dateToken = null;
    let gDelta = null;
    const damList = [];

    for (const p of parts) {
      if (/^\d+d$/i.test(p) || /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(p)) {
        dateToken = p;
      } else if (/^\d+g$/i.test(p)) {
        gDelta = Number(p.slice(0, -1));
      } else if (/^\d+$/.test(p)) {
        gDelta = Number(p);
      } else {
        damList.push(p.toUpperCase());
      }
    }
    const dateObj = parseCustomDate(dateToken, false);
    return recordDiThuoc(damList.length ? damList : ["A27"], dateObj, chatId, userName, gDelta);
  }

  // Tránh bão
  if (/^(?:tranh\s*bao|nghi\s*bao|bao)(\s+.*)?$/i.test(textRaw)) {
    const parts = textRaw.split(/\s+/);
    let days = 1;
    let dateToken = null;
    for (const p of parts) {
      if (/^\d+d$/i.test(p) || /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(p)) dateToken = p;
      else if (/^\d+$/.test(p)) days = Number(p);
    }
    const dateObj = parseCustomDate(dateToken, false);
    return recordNghiBien("BAO", days, dateObj, chatId, userName);
  }

  // Nghỉ gió / Làm bờ
  if (textRaw.toLowerCase() === "nghi gio" || textRaw.toLowerCase() === "nghỉ gió") {
    return recordNghiBien("GIO", 1, kst(), chatId, userName);
  }
  if (textRaw.toLowerCase() === "lam bo" || textRaw.toLowerCase() === "làm bờ") {
    return recordNghiBien("BO", 1, kst(), chatId, userName);
  }

  // Thêm đám / Sửa dây
  if (/^them\s+(?:dam|bai)\s+/i.test(textRaw)) {
    const body = textRaw.replace(/^them\s+(?:dam|bai)\s+/i, "").trim();
    const parts = body.split(/\s+/);
    const dam = parts[0].toUpperCase();
    let loai = "Lưới Nhà Máy";
    let soDay = DEFAULT_NHA_MAY_DAY;
    if (parts[1]) loai = normalizeLoaiLuoi(parts[1]);
    if (parts[2] && Number(parts[2]) > 0) soDay = Number(parts[2]);
    else if (loai === "Lưới Nhà Máy") soDay = DEFAULT_NHA_MAY_DAY;

    await upsertDamConfig(dam, { loaiLuoi: loai, soDay });
    await send(
      chatId,
      `✅ Đã thêm Đám ${dam} (${loai} - ${soDay} dây) cho Vụ mùa ${getSeasonDisplay()}.`,
      { reply_markup: buildMainKeyboard() }
    );
    return;
  }

  if (/^sua\s+day\s+/i.test(textRaw)) {
    const body = textRaw.replace(/^sua\s+day\s+/i, "").trim();
    const parts = body.split(/\s+/);
    const dam = parts[0]?.toUpperCase();
    const max = Number(parts[1]);
    if (!dam || !Number.isFinite(max) || max <= 0) {
      await send(chatId, "❌ Cú pháp: sua day <TênĐám> <SốDâyMới>", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }
    await upsertDamConfig(dam, { soDay: max });
    await send(chatId, `✅ Đã cập nhật Đám ${dam} thành ${max} dây.`, {
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  // Sửa dòng gần nhất
  if (textRaw.toLowerCase().startsWith("sua ")) {
    const newLine = textRaw.slice(4).trim();
    const parsed = parseWorkLine(newLine);
    if (!parsed || parsed.type !== "WORK") {
      await send(
        chatId,
        "❌ Cú pháp sửa chưa đúng. Ví dụ: sua A 60b 220k hoặc sua A 30g 40b 220k",
        { reply_markup: buildMainKeyboard() }
      );
      return;
    }

    const rows = await getSeasonDataRows();
    const idx = findLastWorkRowIndexForUserAndBai(rows, userName, parsed.bai);
    if (!idx) {
      await send(chatId, "❌ Không tìm thấy dòng gần nhất của bãi này để sửa.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const objs = rows.map(rowToObj);
    const rowIndex0 = idx - 2;
    const oldObj = rowToObj(rows[rowIndex0]);
    const objsWithoutOld = objs.filter((_, i) => i !== rowIndex0);

    const workDate = parseCustomDate(parsed.dateToken, true);
    const dateYmd = ymd(workDate);
    const bc = baoChuan(parsed.b);
    const won = bc * parsed.k * 1000;

    const { max, newProgress, tinhHinh, vong } = buildWorkProgress({
      allObjs: objsWithoutOld,
      bai: parsed.bai,
      gDelta: parsed.gDelta,
    });

    const totalBefore = objsWithoutOld.reduce((s, o) => s + (o.won || 0), 0);
    const totalToNow = totalBefore + won;

    const newRow = [
      oldObj.ts || new Date().toISOString(),
      dateYmd,
      userName,
      parsed.bai,
      newProgress,
      max,
      tinhHinh,
      parsed.b,
      bc,
      parsed.k,
      won,
      parsed.note || oldObj.note || "",
    ];

    await updateSeasonDataRow(idx, newRow);

    const text =
`✏️ ĐÃ CẬP NHẬT DÒNG GẦN NHẤT:
--- 🌊 SỔ KIM (Vòng: ${vong}) ---
📅 Ngày: ${fmtDayVN(workDate)}
📍 Đám: ${parsed.bai}
✂️ Tình hình: ${tinhHinh} (${newProgress}/${max} dây)
📦 Sản lượng: ${parsed.b} bao (≈ ${bc} bao chuẩn)
💰 Giá: ${parsed.k}k
💵 THU: ${won.toLocaleString()} ₩
🏆 TỔNG THU VỤ: ${moneyToTrieu(totalToNow)} ₩`.trim();

    await send(chatId, text, { reply_markup: buildMainKeyboard() });
    return;
  }

  // Tiếp nối nhiều đám (TIEP)
  const tiep = parseTiepMultiLine(textRaw);
  if (tiep && Array.isArray(tiep) && tiep.length) {
    const rows = await getSeasonDataRows();
    const objs = rows.map(rowToObj);

    for (const one of tiep) {
      const lastDelta = computeLastPartialDelta(objs, one.bai);
      if (!lastDelta) {
        await send(
          chatId,
          `⚠️ ${one.bai} đang CẮT SẠCH hoặc chưa có dữ liệu cắt dỡ để "Tiep".`,
          { reply_markup: buildMainKeyboard() }
        );
        continue;
      }
      await processWorkEntry(
        {
          type: "WORK",
          bai: one.bai,
          gDelta: lastDelta,
          b: one.b,
          k: one.k,
          dateToken: one.dateToken,
          note: one.note ? `[Tiep] ${one.note}` : "[Tiep]",
        },
        chatId,
        userName
      );
    }
    return;
  }

  // Nhiều đám cùng lúc
  const multi = parseMultiWorkLine(textRaw);
  if (multi && Array.isArray(multi) && multi.length) {
    let totalWon = 0;
    let totalB = 0;
    const bais = [];
    let usedK = multi[0].k;

    for (const one of multi) {
      await processWorkEntry(one, chatId, userName);
      totalB += one.b;
      totalWon += baoChuan(one.b) * one.k * 1000;
      if (!bais.includes(one.bai)) bais.push(one.bai);
    }

    const summaryText =
`✨ TỔNG KẾT LỆNH NHIỀU ĐÁM:
📍 Các đám: ${bais.join(", ")}
📦 Tổng bao: ${totalB} bao (≈ ${baoChuan(totalB)} bao chuẩn)
💰 Giá: ${usedK}k
💵 TỔNG TIỀN ĐỢT NÀY: ${totalWon.toLocaleString()} ₩ (${moneyToTrieu(totalWon)})`;

    await send(chatId, summaryText, { reply_markup: buildMainKeyboard() });
    return;
  }

  // Cắt đơn đám
  const parsed = parseWorkLine(textRaw);
  if (parsed && parsed.type === "WORK") {
    await processWorkEntry(parsed, chatId, userName);
    return;
  }

  // Sai cú pháp
  await send(
    chatId,
    `❌ Nhập sai cú pháp rồi bạn ơi 😅\n\nVí dụ các lệnh thường dùng:\n• Cắt sạch: A 60b 220k\n• Cắt dỡ: A 30g 40b 220k\n\n👉 Bạn hãy bấm các nút trên màn hình để thao tác một chạm mà không cần gõ lệnh nhé!`,
    { reply_markup: buildMainKeyboard() }
  );
}

/* ================== WEBHOOK ================== */
app.get("/", (_, res) => res.send("KIM BOT OK - " + VERSION));
app.get("/ping", (_, res) =>
  res.json({ ok: true, version: VERSION, season: getSeasonDisplay() })
);

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

/* ================== KHỞI CHẠY SERVER ================== */
const PORT = process.env.PORT || 10000;

(async () => {
  try {
    await loadConfigFromSheet();
    await getSeasonDataRows(true); // Load sẵn data vào cache khi bot khởi động
  } catch (e) {
    console.log("Init cache warning:", e?.message || e);
  }
  app.listen(PORT, () =>
    console.log(
      `✅ KIM BOT TURBO READY on port ${PORT} | ${VERSION} | Vụ mùa: ${getSeasonDisplay()}`
    )
  );
})();
