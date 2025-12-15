import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
app.use(express.json());

/* ================== ENV ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Render Secret File path (bạn đang dùng kiểu này)
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/etc/secrets/google-service-account.json";

/* ================== BASIC ROUTES ================== */
app.get("/", (req, res) => res.status(200).send("OK - telegram-bot-kim2025"));
app.get("/ping", (req, res) => res.status(200).json({ ok: true, t: Date.now() }));

/* ================== GOOGLE SHEET AUTH ================== */
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

/* ================== HELPERS ================== */
async function sendMessage(chat_id, text) {
  if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
  return fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

// (Tùy bạn dùng) ghi log đơn giản vào Sheet
async function appendToSheet(values) {
  if (!GOOGLE_SHEET_ID) return; // không có sheet thì bỏ qua
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "Log!A1", // bạn tạo tab Log trong Google Sheet
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/* ================== WEBHOOK ================== */
app.post("/webhook", async (req, res) => {
  // ✅ trả 200 ngay để Telegram không retry
  res.sendStatus(200);

  try {
    const update = req.body;
    console.log("Webhook received:", JSON.stringify(update));

    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = msg?.text;

    if (!chatId || !text) return;

    // TEST: phản hồi ngay
    if (text === "/start") {
      await sendMessage(
        chatId,
        "Bot KIM 2025 OK ✅\nGõ: test\nHoặc gõ bất kỳ để mình phản hồi."
      );
      return;
    }

    if (text.toLowerCase() === "test") {
      await sendMessage(chatId, "Test OK ✅ Webhook đang hoạt động.");
      // ghi sheet thử (nếu có)
      await appendToSheet([new Date().toISOString(), chatId, "TEST", "OK"]);
      return;
    }

    // Mặc định: echo lại
    await sendMessage(chatId, `Bạn vừa gửi: ${text}`);

    // log lên sheet (nếu có)
    await appendToSheet([new Date().toISOString(), chatId, "MSG", text]);
  } catch (e) {
    console.error("WEBHOOK ERROR:", e?.message || e);
  }
});

/* ================== START SERVER (RENDER PORT) ================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ KIM bot running on port", PORT);
});
