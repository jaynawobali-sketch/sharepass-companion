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

function normalizeVoiceSession(voiceSession, speakers, updatedAt) {
  return {
    active: Boolean(voiceSession?.active ?? (Array.isArray(speakers) && speakers.length > 0)),
    updatedAt: voiceSession?.updatedAt || updatedAt,
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
  createdAt = createTimestamp(),
}) {
  return {
    id: `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    author,
    text,
    type,
    createdAt,
  };
}

const CIRCLE_SEEDS = [
  {
    id: "work-career-pressure",
    icon: "💼",
    topic: "Work & Career Pressure",
    description: "A steady room for burnout, deadlines, toxic teams, and the quiet fear of falling behind.",
    schedule: "Tuesdays · 8:00 PM",
    stageTopic: "What has work been asking from you lately?",
    hostNote: "Start with what feels heaviest. We slow it down together here.",
    members: [
      createCircleMember({ id: "member-asha", name: "Asha", role: "moderator", mood: "stress", color: MEMBER_COLORS[0] }),
      createCircleMember({ id: "member-daniel", name: "Daniel", role: "speaker", mood: "anxiety", color: MEMBER_COLORS[1] }),
      createCircleMember({ id: "member-rehema", name: "Rehema", role: "member", mood: "tired", color: MEMBER_COLORS[2] }),
      createCircleMember({ id: "member-jonah", name: "Jonah", role: "member", mood: "confused", color: MEMBER_COLORS[3] }),
    ],
    speakers: ["member-asha", "member-daniel"],
    announcements: [
      {
        id: "announce-work-1",
        title: "Tonight's support circle",
        body: "We are keeping tonight's room voice-first, one person at a time, with chat open for encouragement and lighter check-ins.",
        createdAt: createTimestamp(-180),
        author: "Asha",
      },
    ],
    chat: [
      createCircleMessage({ author: "Asha", text: "Welcome in. If work has been swallowing your week, start where it hurts most.", type: "announcement", createdAt: createTimestamp(-160) }),
      createCircleMessage({ author: "Daniel", text: "I want to talk after the current speaker. The pressure has been following me home lately.", createdAt: createTimestamp(-115) }),
      createCircleMessage({ author: "Rehema", text: "Same here. I have mostly been listening, but even that helps.", createdAt: createTimestamp(-95) }),
    ],
  },
  {
    id: "relationship-struggles",
    icon: "💔",
    topic: "Relationship Struggles",
    description: "For heartbreak, family tension, emotional distance, and the confusion that comes with hard conversations.",
    schedule: "Thursdays · 7:30 PM",
    stageTopic: "What conversation are you still carrying in your chest?",
    hostNote: "You do not have to explain everything perfectly to be heard here.",
    members: [
      createCircleMember({ id: "member-michelle", name: "Michelle", role: "moderator", mood: "sadness", color: MEMBER_COLORS[4] }),
      createCircleMember({ id: "member-leo", name: "Leo", role: "speaker", mood: "lonely", color: MEMBER_COLORS[0] }),
      createCircleMember({ id: "member-ivy", name: "Ivy", role: "member", mood: "hopeful", color: MEMBER_COLORS[5] }),
    ],
    speakers: ["member-michelle", "member-leo"],
    announcements: [
      {
        id: "announce-relationship-1",
        title: "Warm reminder",
        body: "If someone else's story stirs yours, use the chat gently and raise your hand when you need space to speak.",
        createdAt: createTimestamp(-140),
        author: "Michelle",
      },
    ],
    chat: [
      createCircleMessage({ author: "Michelle", text: "This room can hold grief, confusion, and even the weird laughter that shows up in the middle of both.", type: "announcement", createdAt: createTimestamp(-130) }),
      createCircleMessage({ author: "Leo", text: "I appreciate that. Sometimes the only way I get through talking about this is by joking for a second.", createdAt: createTimestamp(-88) }),
    ],
  },
  {
    id: "financial-anxiety",
    icon: "💸",
    topic: "Financial Anxiety",
    description: "A practical and gentle room for debt stress, job loss, school fees, and the shame that money pressure can create.",
    schedule: "Saturdays · 5:00 PM",
    stageTopic: "What money fear keeps returning for you this week?",
    hostNote: "We focus on honesty first, then one next step at a time.",
    members: [
      createCircleMember({ id: "member-zuri", name: "Zuri", role: "moderator", mood: "anxiety", color: MEMBER_COLORS[1] }),
      createCircleMember({ id: "member-peter", name: "Peter", role: "speaker", mood: "stress", color: MEMBER_COLORS[2] }),
      createCircleMember({ id: "member-nia", name: "Nia", role: "member", mood: "confused", color: MEMBER_COLORS[3] }),
      createCircleMember({ id: "member-chris", name: "Chris", role: "member", mood: "hopeful", color: MEMBER_COLORS[5] }),
    ],
    speakers: ["member-zuri", "member-peter"],
    announcements: [
      {
        id: "announce-finance-1",
        title: "Resource share",
        body: "If you mention a budgeting tool or support resource, drop it into chat after the speaker finishes so the room does not feel interrupted.",
        createdAt: createTimestamp(-100),
        author: "Zuri",
      },
    ],
    chat: [
      createCircleMessage({ author: "Zuri", text: "You can vent here without turning everything into a lesson. We can get practical after you feel heard.", type: "announcement", createdAt: createTimestamp(-92) }),
      createCircleMessage({ author: "Chris", text: "I like that. Sometimes I need to breathe before I can even look at numbers.", createdAt: createTimestamp(-60) }),
    ],
  },
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
  return CIRCLE_SEEDS.map(circle => normalizeCircle(circle));
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

export function syncCircleVoiceSession(circle) {
  const normalizedCircle = normalizeCircle(circle);

  return normalizeCircle({
    ...normalizedCircle,
    voiceSession: {
      ...normalizedCircle.voiceSession,
      active: normalizedCircle.speakers.length > 0,
      updatedAt: createTimestamp(),
    },
    lastActivityAt: createTimestamp(),
  });
}
