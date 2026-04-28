const MEMBER_COLORS = [
  "#c4a882",
  "#8fa8c8",
  "#a8c4b4",
  "#b8a8c8",
  "#c47a7a",
  "#b4a894",
];

const DEFAULT_GUIDELINES = [
  "One person speaks at a time so the room stays calm.",
  "Raise your hand when you want the floor and wait for the moderator to invite you.",
  "Chat can stay lighter, but keep it kind, private, and grounded in support.",
];

function normalizeUnreadCounts(unreadCounts) {
  if (!unreadCounts || typeof unreadCounts !== "object" || Array.isArray(unreadCounts)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(unreadCounts)
      .map(([memberId, count]) => [String(memberId || "").trim(), Math.max(0, Number(count) || 0)])
      .filter(([memberId]) => memberId),
  );
}

function resolveLastActivityAt(circle, createdAt) {
  const messageTimes = Array.isArray(circle.chat)
    ? circle.chat.map(message => message?.createdAt).filter(Boolean)
    : [];
  const announcementTimes = Array.isArray(circle.announcements)
    ? circle.announcements.map(announcement => announcement?.createdAt).filter(Boolean)
    : [];

  return circle.lastActivityAt
    || messageTimes.sort().at(-1)
    || announcementTimes.sort().at(-1)
    || createdAt;
}

function normalizeTimestamp(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeVoiceSession(voiceSession, speakers, updatedAt) {
  const active = Boolean(voiceSession?.active ?? (Array.isArray(speakers) && speakers.length > 0));
  const resolvedUpdatedAt = normalizeTimestamp(voiceSession?.updatedAt) || updatedAt;

  return {
    active,
    updatedAt: resolvedUpdatedAt,
    startedAt: active
      ? normalizeTimestamp(voiceSession?.startedAt) || resolvedUpdatedAt
      : normalizeTimestamp(voiceSession?.startedAt),
  };
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createId(prefix, value) {
  const slug = slugify(value);
  return `${prefix}-${slug || Date.now()}`;
}

function createTimestamp(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60000).toISOString();
}

export function createCurrentMemberId(sessionProfile) {
  if (sessionProfile?.memberId) {
    return String(sessionProfile.memberId).trim();
  }

  if (sessionProfile?.email) {
    return `member-${slugify(sessionProfile.email)}`;
  }

  return `member-${slugify(sessionProfile?.username || "guest")}`;
}

export function createCircleMember({
  id,
  name,
  role = "member",
  mood = "hopeful",
  color,
  email = "",
}) {
  return {
    id,
    name,
    role,
    mood,
    color: color || MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
    email,
    joinedAt: createTimestamp(),
  };
}

export function createCircleMessage({
  author,
  text,
  type = "chat",
  authorRole = "",
  createdAt = createTimestamp(),
}) {
  return {
    id: `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    author,
    authorRole,
    text,
    type,
    createdAt,
  };
}

export const LEGACY_DEMO_CIRCLE_IDS = [
  "work-career-pressure",
  "relationship-struggles",
  "financial-anxiety",
];

export function normalizeCircle(circle) {
  const createdAt = circle.createdAt || createTimestamp();

  return {
    id: circle.id || createId("circle", circle.topic),
    icon: circle.icon || "🫶",
    topic: circle.topic,
    description: circle.description,
    schedule: circle.schedule || "To be scheduled",
    stageTopic: circle.stageTopic || "What feels present for you today?",
    hostNote: circle.hostNote || "Take your time. This room can move slowly.",
    allowRequests: circle.allowRequests !== false,
    requestQueue: Array.isArray(circle.requestQueue) ? circle.requestQueue : [],
    guidelines: Array.isArray(circle.guidelines) && circle.guidelines.length > 0 ? circle.guidelines : DEFAULT_GUIDELINES,
    members: Array.isArray(circle.members) ? circle.members : [],
    speakers: Array.isArray(circle.speakers) ? circle.speakers : [],
    announcements: Array.isArray(circle.announcements) ? circle.announcements : [],
    chat: Array.isArray(circle.chat) ? circle.chat : [],
    unreadCounts: normalizeUnreadCounts(circle.unreadCounts),
    voiceSession: normalizeVoiceSession(circle.voiceSession, circle.speakers, createdAt),
    createdAt,
    lastActivityAt: resolveLastActivityAt(circle, createdAt),
    createdBy: circle.createdBy || "SharePass",
  };
}

export function createSeedCircles() {
  return [];
}

export function createCircleFromDraft({ topic, description, schedule, icon, createdBy }) {
  const author = createdBy?.username || "Super Admin";

  return normalizeCircle({
    id: createId("circle", topic),
    topic,
    description,
    schedule,
    icon: icon || "🫶",
    stageTopic: `Opening space for ${topic.toLowerCase()}. What needs a softer place tonight?`,
    hostNote: "The moderator sets the pace, members raise hands for the floor, and chat stays open for support.",
    members: [],
    speakers: [],
    announcements: [
      {
        id: createId("announcement", topic),
        title: "Circle created",
        body: `${author} opened this circle. Members can now join, listen quietly, chat, and request the floor.`,
        createdAt: createTimestamp(),
        author,
      },
    ],
    chat: [
      createCircleMessage({
        author,
        text: "This circle is live. Join when you are ready and use the room in the way that feels safest.",
        type: "announcement",
      }),
    ],
    createdBy: author,
  });
}

export function getCircleMember(circle, memberId) {
  return circle?.members?.find(member => member.id === memberId) || null;
}

export function getCircleSpeakers(circle) {
  return circle.members.filter(member => circle.speakers.includes(member.id));
}

export function getCircleAudience(circle) {
  return circle.members.filter(member => !circle.speakers.includes(member.id));
}

export function getCircleModerators(circle) {
  return circle.members.filter(member => member.role === "moderator");
}

export function getCirclePreviewColors(circle, limit = 4) {
  return circle.members.slice(0, limit).map(member => member.color);
}

export function markCircleRead(circle, memberId) {
  const normalizedCircle = normalizeCircle(circle);

  if (!memberId) {
    return normalizedCircle;
  }

  return normalizeCircle({
    ...normalizedCircle,
    unreadCounts: {
      ...normalizedCircle.unreadCounts,
      [memberId]: 0,
    },
  });
}

export function bumpCircleUnreadCounts(circle, actorMemberId) {
  const normalizedCircle = normalizeCircle(circle);

  return normalizeCircle({
    ...normalizedCircle,
    unreadCounts: normalizedCircle.members.reduce((nextUnreadCounts, member) => {
      if (!member?.id) {
        return nextUnreadCounts;
      }

      nextUnreadCounts[member.id] = member.id === actorMemberId
        ? 0
        : (normalizedCircle.unreadCounts[member.id] || 0) + 1;

      return nextUnreadCounts;
    }, { ...normalizedCircle.unreadCounts }),
    lastActivityAt: createTimestamp(),
  });
}

export function syncCircleVoiceSession(circle, options = {}) {
  const normalizedCircle = normalizeCircle(circle);
  const active = typeof options.active === "boolean"
    ? options.active
    : normalizedCircle.voiceSession.active;
  const updatedAt = normalizeTimestamp(options.updatedAt) || createTimestamp();
  const startedAt = active
    ? normalizeTimestamp(options.startedAt)
      || (normalizedCircle.voiceSession.active ? normalizedCircle.voiceSession.startedAt : "")
      || updatedAt
    : normalizeTimestamp(options.startedAt);

  return normalizeCircle({
    ...normalizedCircle,
    voiceSession: {
      ...normalizedCircle.voiceSession,
      active,
      updatedAt,
      startedAt,
    },
    lastActivityAt: updatedAt,
  });
}
