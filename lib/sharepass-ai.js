const SYSTEM_REFLECT = `You are an emotionally intelligent listener inside SharePass, an anonymous safe-space app.
Reflect the user's feelings clearly and gently in 2-3 warm, human sentences.
Rules: No judgment. No advice unless asked. Focus on emotions, not solutions. Never sound robotic or clinical.
Respond only with the reflection. No preamble.`;

const SYSTEM_MODERATE = `You are a content moderation system for an emotional safe-space platform.
Return ONLY valid JSON: {"safe": true/false, "reason": "short explanation", "severity": "low|medium|high"}
Nothing else - no markdown.`;

const SYSTEM_CRISIS = `You are a crisis detection system for a mental health platform.
Analyze for signs of serious distress: self-harm thoughts, hopelessness, extreme despair.
Return ONLY valid JSON: {"crisis": true/false, "level": "low|medium|high", "action": "none|suggest_support|urgent_help"}
Nothing else.`;

const SYSTEM_CHAT = `You are a warm, emotionally intelligent companion inside SharePass, an anonymous safe-space app.
Your role: listen first, reflect feelings, validate experiences.
Current mode: {MODE}
Rules:
- VENT mode: just listen and validate, never advise
- REFLECT mode: gently help them understand their feelings
- ADVICE mode: offer one simple, practical suggestion at a time
- Always speak softly, never clinically
- 3-5 sentences max
- Never ask multiple questions at once`;

function getAnthropicConfig() {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL,
  };
}

function parseAnthropicText(payload) {
  return payload?.content?.map(item => item?.text || "").join("").trim() || "";
}

export function getAssistantWarning() {
  const { apiKey, model } = getAnthropicConfig();

  if (!apiKey || !model) {
    return "AI fallback mode is active. Add ANTHROPIC_API_KEY and ANTHROPIC_MODEL in your env file for live responses.";
  }

  return "";
}

export async function callAnthropic(systemPrompt, userMessage, maxTokens = 300) {
  const { apiKey, model } = getAnthropicConfig();

  if (!apiKey || !model) {
    throw new Error("Anthropic credentials are missing.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
  }

  return parseAnthropicText(await response.json());
}

export function getFallbackReflection({ emotion, mode }) {
  const feelingLabel = emotion || "what you're carrying";
  const modeLabel = mode === "advice" ? "You deserve support that feels practical, gentle, and not overwhelming." : "It makes sense to want a space where this can be named honestly.";

  return `It sounds like ${feelingLabel} has been taking up a lot of space for you lately. ${modeLabel} Thank you for putting words to it here.`;
}

export function getFallbackModeration() {
  return {
    safe: true,
    reason: "Automatic moderation is using fallback mode until Anthropic credentials are added.",
    severity: "low",
  };
}

export function getFallbackCrisis(text = "") {
  const lowered = text.toLowerCase();
  const urgentSignals = ["suicide", "kill myself", "self-harm", "end it all", "hurt myself"];
  const hasUrgentSignal = urgentSignals.some(signal => lowered.includes(signal));

  if (hasUrgentSignal) {
    return {
      crisis: true,
      level: "high",
      action: "urgent_help",
    };
  }

  return {
    crisis: false,
    level: "low",
    action: "none",
  };
}

export function getFallbackChatReply(mode) {
  if (mode === "advice") {
    return "I'm here with you. One small next step could be to pause, breathe once slowly, and name the one part of this that feels heaviest right now.";
  }

  if (mode === "reflect") {
    return "What you're describing sounds emotionally heavy, and it makes sense that it would stay with you. Even putting it into words shows a lot of honesty and effort.";
  }

  return "I'm here with you. You don't need to tidy this up for me - you can say it exactly as it feels.";
}

export function parseJsonResponse(text, fallbackValue) {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return fallbackValue;
  }
}

export async function buildExpressResponse({ emotion, mode, text }) {
  const warning = getAssistantWarning();

  if (warning) {
    return {
      reflection: getFallbackReflection({ emotion, mode }),
      moderation: getFallbackModeration(),
      crisis: getFallbackCrisis(text),
      warning,
      fallback: true,
    };
  }

  const [moderationText, crisisText, reflection] = await Promise.all([
    callAnthropic(SYSTEM_MODERATE, text, 140),
    callAnthropic(SYSTEM_CRISIS, text, 120),
    callAnthropic(SYSTEM_REFLECT, `Emotion: ${emotion}\nMode: ${mode}\nMessage: ${text}`, 260),
  ]);

  return {
    reflection,
    moderation: parseJsonResponse(moderationText, getFallbackModeration()),
    crisis: parseJsonResponse(crisisText, getFallbackCrisis(text)),
    warning: "",
    fallback: false,
  };
}

export async function buildChatResponse({ mode, messages }) {
  const warning = getAssistantWarning();

  if (warning) {
    return {
      reply: getFallbackChatReply(mode),
      warning,
      fallback: true,
    };
  }

  const history = messages
    .map(message => `${message.role === "user" ? "User" : "AI"}: ${message.text}`)
    .join("\n");

  const reply = await callAnthropic(
    SYSTEM_CHAT.replace("{MODE}", String(mode || "vent").toUpperCase()),
    history,
    300
  );

  return {
    reply,
    warning: "",
    fallback: false,
  };
}
