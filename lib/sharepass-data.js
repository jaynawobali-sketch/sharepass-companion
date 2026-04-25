export const EMOTIONS = [
  { id: "stress", icon: "😤", label: "Stressed", color: "#c4a882" },
  { id: "sadness", icon: "💧", label: "Sad", color: "#8fa8c8" },
  { id: "anger", icon: "🔥", label: "Angry", color: "#c47a7a" },
  { id: "anxiety", icon: "🌀", label: "Anxious", color: "#b8a8c8" },
  { id: "lonely", icon: "🌑", label: "Lonely", color: "#7a8fa8" },
  { id: "confused", icon: "🌫", label: "Confused", color: "#a8b8c4" },
  { id: "hopeful", icon: "🌱", label: "Hopeful", color: "#a8c4b4" },
  { id: "tired", icon: "🍂", label: "Exhausted", color: "#b4a894" },
];

export const LEGACY_DEMO_POST_IDS = ["seed-1", "seed-2", "seed-3"];

const ANONYMOUS_WORDS = [
  "QuietMoon",
  "SilentRain",
  "CalmWave",
  "GentleWind",
  "SoftEcho",
  "DeepSky",
  "StillWater",
  "PaleLight",
];

const ANONYMOUS_AVATARS = ["🌊", "🌙", "🌲", "🍃", "🌿", "🌾"];

const ANONYMOUS_AVATAR_BACKGROUNDS = [
  "linear-gradient(135deg, #c4a882, #c8b88a)",
  "linear-gradient(135deg, #8fa8c8, #a8c4b4)",
  "linear-gradient(135deg, #b8a8c8, #8fa8c8)",
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function createAnonymousUsername() {
  return `${pickRandom(ANONYMOUS_WORDS)}_${Math.floor(Math.random() * 90 + 10)}`;
}

export function formatRelativeTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function normalizePost(post) {
  const createdAt = post.createdAt || new Date().toISOString();

  return {
    id: String(post.id),
    authorId: String(post.authorId || ""),
    username: post.username,
    avatar: post.avatar,
    avatarBg: post.avatarBg,
    emotion: post.emotion,
    content: post.content,
    reflection: post.reflection || "",
    time: post.time || formatRelativeTime(createdAt),
    reactions: post.reactions || { support: 0, relate: 0, hug: 0 },
    reacted: post.reacted || {},
    visibility: post.visibility || "public",
    createdAt,
  };
}

export function buildNewPost({ emotion, content, reflection, visibility, username, authorId = "" }) {
  const createdAt = new Date().toISOString();

  return normalizePost({
    id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    authorId,
    username: username || createAnonymousUsername(),
    avatar: pickRandom(ANONYMOUS_AVATARS),
    avatarBg: pickRandom(ANONYMOUS_AVATAR_BACKGROUNDS),
    emotion,
    content,
    reflection,
    visibility,
    reactions: { support: 0, relate: 0, hug: 0 },
    reacted: {},
    createdAt,
  });
}
