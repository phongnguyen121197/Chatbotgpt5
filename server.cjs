// CommonJS version to avoid ESM/CJS interop errors
const express = require("express");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const larkpkg = require("@larksuiteoapi/node-sdk");
const { Client: LarkClient, Config, LEVEL } = larkpkg;

const app = express();
app.use(bodyParser.json({ type: "*/*" }));

const {
  PORT = 3000,
  OPENAI_API_KEY,
  LARK_APP_ID,
  LARK_APP_SECRET,
  LARK_VERIFICATION_TOKEN // optional
} = process.env;

// Init OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Init Lark
const larkConf = new Config({
  appId: LARK_APP_ID,
  appSecret: LARK_APP_SECRET,
  appType: Config.AppType.SelfBuild,
  domain: Config.Domain.LarkSuite,
  loggerLevel: LEVEL.ERROR
});
const lark = new LarkClient(larkConf);

// Optional: verify Lark token
function verifyToken(req) {
  if (!LARK_VERIFICATION_TOKEN) return true;
  const token = req.body?.token || req.headers["x-lark-signature-token"];
  return token === LARK_VERIFICATION_TOKEN;
}

app.get("/", (_, res) => res.send("✅ Lark GPT-5 bot running (CJS)"));

app.post("/lark/callback", async (req, res) => {
  try {
    const body = req.body || {};

    // Step 1: URL verification
    if (body?.type === "url_verification" && body?.challenge) {
      return res.status(200).send(body.challenge);
    }

    // Step 2: Token check
    if (!verifyToken(req)) {
      return res.status(401).send("invalid token");
    }

    // Step 3: Direct message to bot
    if (body?.header?.event_type === "im.message.receive_v1") {
      const event = body.event;
      const chatId = event?.message?.chat_id;
      let userText = "";

      if (event?.message?.message_type === "text") {
        const content = JSON.parse(event?.message?.content || "{}");
        userText = content.text || "";
      } else {
        userText = "[non-text message]";
      }

      const ai = await openai.responses.create({
        model: "gpt-5",
        input: userText
      });
      const reply = (ai.output_text || "").trim() || "(no response)";

      await lark.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ text: reply }),
          msg_type: "text"
        }
      });

      return res.status(200).send("ok");
    }

    // Step 4: Group @ mention
    if (body?.header?.event_type === "im.message.group_at_msg_v1") {
      const event = body.event;
      const chatId = event?.message?.chat_id;
      const content = JSON.parse(event?.message?.content || "{}");
      const userText = content.text || "";

      const ai = await openai.responses.create({
        model: "gpt-5",
        input: userText
      });
      const reply = (ai.output_text || "").trim() || "(no response)";

      await lark.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ text: reply }),
          msg_type: "text"
        }
      });

      return res.status(200).send("ok");
    }

    return res.status(200).send("ignored");
  } catch (err) {
    console.error(err);
    return res.status(200).send("ok");
  }
});

app.listen(PORT, () => console.log(`🚀 Server on :${PORT}`));
