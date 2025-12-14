import express from "express";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;           // token từ BotFather
const SECRET_PATH = process.env.SECRET_PATH || ""; // ví dụ: "kim2025"
const WEBHOOK_URL = process.env.WEBHOOK_URL || ""; // url render của bạn
const PORT = process.env.PORT || 3000;

function apiUrl(method) {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

async function tg(method, payload) {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return data;
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "➕ Nhập chuyến mới" }],
      [{ text: "📊 Tổng hôm nay" }, { text: "🧾 Tổng cả vụ" }],
      [{ text: "❓ Hướng dẫn" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function helpText() {
  return (
    "📌 *HƯỚNG DẪN*\n\n" +
    "• Nhập nhanh: `A27 60 220`\n" +
    "  (Bãi A27, 60 bao, giá 220k)\n\n" +
    "• Có thể thêm chữ k: `A27 60 220k`\n" +
    "• Có thể thêm 'bao': `A27 60bao 220`\n\n" +
    "_Bot đang chạy bản đơn giản (chưa ghi Google Sheet). " +
    "Sau khi Render chạy OK, mình thêm phần ghi sheet vào._"
  );
}

function parseInput(text) {
  // chấp nhận: A27 60 220 | A27 60bao 220k | A27 70b 220k
  const t = text.trim();
  const m = t.match(/^([A-Za-z]\d+)\s+(\d+)\s*(?:b|bao)?\s+(\d+)\s*(?:k)?$/i);
  if (!m) return null;
  const bai = m[1].toUpperCase();
  const bao = Number(m[2]);
  const gia = Number(m[3]); // đơn vị k
  if (!bao || !gia) return null;
  return { bai, bao, gia };
}

// Health check
app.get("/", (req, res) => res.status(200).send("OK"));

// Route webhook (có secret path để tránh người lạ spam)
app.post(`/${SECRET_PATH}`, async (req, res) => {
  try {
    if (!BOT_TOKEN) return res.status(500).send("Missing BOT_TOKEN");

    const update = req.body;

    // Telegram cần 200 nhanh, xử lý try/catch gọn
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = (update.message.text || "").trim();

      // /start
      if (text === "/start") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "✅ Bot OK. Chọn nút bên dưới hoặc nhập: `A27 60 220`",
          parse_mode: "Markdown",
          reply_markup: mainKeyboard(),
        });
        return res.sendStatus(200);
      }

      // nút menu
      if (text === "❓ Hướng dẫn") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: helpText(),
          parse_mode: "Markdown",
          reply_markup: mainKeyboard(),
        });
        return res.sendStatus(200);
      }

      if (text === "➕ Nhập chuyến mới") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "Nhập theo mẫu: `A27 60 220`",
          parse_mode: "Markdown",
          reply_markup: mainKeyboard(),
        });
        return res.sendStatus(200);
      }

      if (text === "📊 Tổng hôm nay" || text === "🧾 Tổng cả vụ") {
        await tg("sendMessage", {
          chat_id: chatId,
          text:
            "Bản đơn giản chưa cộng tổng (mình sẽ thêm ngay sau khi Render chạy ổn).",
          reply_markup: mainKeyboard(),
        });
        return res.sendStatus(200);
      }

      // parse dữ liệu
      const parsed = parseInput(text);
      if (!parsed) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "⚠️ Nhập sai!\nHãy nhập: [Bãi] [Bao] [Giá]\nVí dụ: A27 60 220",
          reply_markup: mainKeyboard(),
        });
        return res.sendStatus(200);
      }

      // phản hồi OK (tạm thời)
      await tg("sendMessage", {
        chat_id: chatId,
        text: `✅ Đã nhận: *${parsed.bai}* | *${parsed.bao}* bao | *${parsed.gia}k*`,
        parse_mode: "Markdown",
        reply_markup: mainKeyboard(),
      });
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error(err);
    return res.sendStatus(200); // vẫn 200 để Telegram không retry liên tục
  }
});

async function ensureWebhook() {
  // set webhook khi service start (Render)
  if (!BOT_TOKEN) return;
  if (!WEBHOOK_URL) return;
  const url = `${WEBHOOK_URL.replace(/\/$/, "")}/${SECRET_PATH}`;
  const r = await tg("setWebhook", { url });
  console.log("setWebhook:", r);
}

app.listen(PORT, async () => {
  console.log("Listening on", PORT);
  if (WEBHOOK_URL && SECRET_PATH) await ensureWebhook();
});
