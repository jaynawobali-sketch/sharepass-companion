import { warmMongoConnection } from "./lib/mongodb";

export async function register() {
  const strict = String(process.env.MONGO_WARMUP_STRICT || "").trim() === "1";

  try {
    const result = await warmMongoConnection({ strict });
    if (!result.ok && result.configured) {
      console.warn("[sharepass] Mongo warmup failed:", result.error);
    }
  } catch (error) {
    console.error("[sharepass] Mongo warmup failed (strict):", error);
    throw error;
  }
}

