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

export const CIRCLES = [
  { id: 1, icon: "💼", topic: "Work & Career Pressure", members: 4, colors: ["#c4a882", "#8fa8c8", "#a8c4b4", "#b8a8c8"] },
  { id: 2, icon: "💔", topic: "Relationship Struggles", members: 3, colors: ["#c47a7a", "#c4a882", "#a8b8c4"] },
  { id: 3, icon: "💸", topic: "Financial Anxiety", members: 5, colors: ["#8fa8c8", "#a8c4b4", "#c4a882", "#b8a8c8", "#c47a7a"] },
  { id: 4, icon: "🎓", topic: "Academic Stress", members: 4, colors: ["#a8c4b4", "#8fa8c8", "#c4a882", "#b4a894"] },
];

export const SEED_POSTS = [
  {
    id: "seed-1",
    username: "QuietRiver_89",
    avatar: "🌊",
    avatarBg: "linear-gradient(135deg, #8fa8c8, #a8c4b4)",
    emotion: "stress",
    content: "I've been carrying this weight at work for months. My manager keeps piling on responsibilities but I can't seem to say no. I'm drowning quietly and nobody seems to notice.",
    reflection: "It sounds like you're feeling invisible under a crushing load - stuck between the need to be seen as capable and the exhaustion of doing it alone.",
    time: "2h ago",
    reactions: { support: 14, relate: 23, hug: 8 },
    reacted: {},
    visibility: "public",
    createdAt: "2026-04-24T08:00:00.000Z",
  },
  {
    id: "seed-2",
    username: "DuskWalker_44",
    avatar: "🌙",
    avatarBg: "linear-gradient(135deg, #b8a8c8, #8fa8c8)",
    emotion: "lonely",
    content: "Surrounded by people every day and still feel completely alone. I laugh at the right moments. I nod when I should. But inside I'm somewhere else entirely.",
    reflection: "There's a particular ache in performing connection while feeling unseen. What you're describing takes courage to name.",
    time: "4h ago",
    reactions: { support: 31, relate: 47, hug: 19 },
    reacted: {},
    visibility: "public",
    createdAt: "2026-04-24T06:00:00.000Z",
  },
  {
    id: "seed-3",
    username: "SilentPine_7",
    avatar: "🌲",
    avatarBg: "linear-gradient(135deg, #a8c4b4, #c4a882)",
    emotion: "hopeful",
    content: "First time in a long while I woke up and didn't immediately feel dread. Small thing but wanted to put it somewhere real.",
    reflection: "Moments like this matter - a morning without dread is not small, it's significant. You noticed it, and you named it.",
    time: "6h ago",
    reactions: { support: 52, relate: 28, hug: 34 },
    reacted: {},
    visibility: "public",
    createdAt: "2026-04-24T04:00:00.000Z",
  },
];

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

export function buildNewPost({ emotion, content, reflection, visibility }) {
  const createdAt = new Date().toISOString();

  return normalizePost({
    id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    username: createAnonymousUsername(),
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
