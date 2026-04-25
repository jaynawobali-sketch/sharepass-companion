import { readJsonObjectBody } from "../../lib/api-route-utils";
import {
  buildChatResponse,
  buildExpressResponse,
  getAssistantProviderStatus,
} from "../../lib/sharepass-ai";

function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed." });
}

function normalizeMode(value) {
  const mode = String(value || "vent").trim().toLowerCase();

  if (["vent", "reflect", "advice"].includes(mode)) {
    return mode;
  }

  return "vent";
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      tasks: ["express", "chat"],
      assistant: getAssistantProviderStatus(),
    });
  }

  try {
    const parsedBody = readJsonObjectBody(req);

    if (!parsedBody.ok) {
      return res.status(400).json({ error: parsedBody.error });
    }

    const body = parsedBody.body;
    const task = String(body.task || "").trim().toLowerCase();
    const text = String(body.text || "");
    const emotion = String(body.emotion || "").trim().toLowerCase();
    const mode = normalizeMode(body.mode);
    const messages = Array.isArray(body.messages) ? body.messages : [];

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
