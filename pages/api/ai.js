import { buildChatResponse, buildExpressResponse } from "../../lib/sharepass-ai";

function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "POST");
  return res.status(405).json({ error: "Method not allowed." });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const { task, text = "", emotion = "", mode = "vent", messages = [] } = req.body || {};

    if (task === "express") {
      if (text.trim().length < 10) {
        return res.status(400).json({ error: "Write at least 10 characters before requesting a reflection." });
      }

      const payload = await buildExpressResponse({
        emotion: String(emotion),
        mode: String(mode),
        text: String(text),
      });

      return res.status(200).json(payload);
    }

    if (task === "chat") {
      const cleanedMessages = Array.isArray(messages)
        ? messages
            .map(message => ({
              role: message?.role === "ai" ? "ai" : "user",
              text: String(message?.text || "").trim(),
            }))
            .filter(message => message.text)
        : [];

      if (cleanedMessages.length === 0) {
        return res.status(400).json({ error: "Add a message before contacting the assistant." });
      }

      const payload = await buildChatResponse({
        mode: String(mode),
        messages: cleanedMessages,
      });

      return res.status(200).json(payload);
    }

    return res.status(400).json({ error: "Unsupported AI task." });
  } catch (error) {
    console.error("AI route failed", error);
    return res.status(500).json({ error: "The assistant is unavailable right now. Please try again in a moment." });
  }
}
