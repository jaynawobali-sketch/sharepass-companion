import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Icon from "./Icon";
import { EMOTIONS, formatRelativeTime } from "../lib/sharepass-data";
import {
  createCurrentMemberId,
  getCircleMember,
  getCircleModerators,
  getCirclePreviewColors,
} from "../lib/sharepass-circles";
import {
  clearSharePassSession,
  ensureSuperAdminEmails,
  GATED_VIEWS,
  getSharePassSession,
  readStoredTheme,
  getSessionMethodLabel,
  isSuperAdminSession,
  isGuestEntry,
  saveSharePassSession,
  SESSION_KEYS,
} from "../lib/sharepass-session";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error || "Something went wrong. Please try again.");
    error.status = response.status;
    throw error;
  }

  return payload;
}

const BASE_NAV = [
  { id: "home", label: "Chats", Ic: Icon.Chat },
  { id: "express", label: "Express", Ic: Icon.Express },
  { id: "chat", label: "AI Assist", Ic: Icon.Assistant },
  { id: "circles", label: "Circles", Ic: Icon.Circles },
];
const ADMIN_NAV_ITEM = { id: "admin", label: "Admin", Ic: Icon.Settings };

const DEFAULT_ADMIN_DATA = {
  users: [],
  feedback: [],
  storage: "",
  warning: "",
  stats: {
    totalCircles: 0,
    liveCircles: 0,
    totalUsers: 0,
    openFeedback: 0,
  },
};
const WEBRTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
const VOICE_POLL_INTERVAL_MS = 2500;
const VOICE_HEARTBEAT_INTERVAL_MS = 5000;
const EMPTY_ITEMS = [];

function createVoiceClientId(prefix = "voice") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function formatElapsedDuration(startedAt, nowMs = Date.now()) {
  const startedMs = new Date(startedAt).getTime();

  if (!startedAt || !Number.isFinite(startedMs)) {
    return "00:00";
  }

  const totalSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function measureAnalyserLevel(analyser, sampleBuffer) {
  if (!analyser || !sampleBuffer) {
    return 0;
  }

  analyser.getByteFrequencyData(sampleBuffer);

  let total = 0;

  for (let index = 0; index < sampleBuffer.length; index += 1) {
    total += sampleBuffer[index];
  }

  return clampUnit((total / Math.max(1, sampleBuffer.length) / 255 - 0.04) / 0.56);
}

function getCircleUnreadCount(circle, memberId) {
  return Math.max(0, Number(circle?.unreadCounts?.[memberId] || 0));
}

function isCircleLive(circle) {
  return Boolean(circle?.voiceSession?.active || circle?.speakers?.length > 0);
}

function sortCirclesByActivity(circles, currentUserId) {
  return [...circles].sort((left, right) => {
    const leftScore = (isCircleLive(left) ? 1000 : 0) + getCircleUnreadCount(left, currentUserId);
    const rightScore = (isCircleLive(right) ? 1000 : 0) + getCircleUnreadCount(right, currentUserId);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return new Date(right.lastActivityAt || right.createdAt) - new Date(left.lastActivityAt || left.createdAt);
  });
}

function getLatestCircleMessage(circle) {
  return Array.isArray(circle?.chat) && circle.chat.length > 0
    ? circle.chat[circle.chat.length - 1]
    : null;
}

function NotificationBadge({ value, tone = "default", live = false }) {
  if (!value && !live) {
    return null;
  }

  return (
    <span className={`notification-badge ${tone} ${live ? "live" : ""}`}>
      {live && !value ? "Live" : value}
    </span>
  );
}

function ViewTabs({ items, activeId, onChange }) {
  return (
    <div className="view-tabs" role="tablist">
      {items.map(item => (
        <button
          key={item.id}
          className={`view-tab ${activeId === item.id ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeId === item.id}
          onClick={() => onChange(item.id)}
        >
          <span>{item.label}</span>
          {item.badge ? (
            <span className={`view-tab-badge ${item.badgeTone || "default"}`}>{item.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function CirclePreviewCard({
  circle,
  currentUserId,
  onDeleteCircle,
  onJoinCircle,
  onOpenCircle,
  showManage = false,
}) {
  const joined = circle.members.some(member => member.id === currentUserId);
  const previewColors = getCirclePreviewColors(circle);
  const unreadCount = getCircleUnreadCount(circle, currentUserId);
  const liveNow = isCircleLive(circle);
  const latestMessage = getLatestCircleMessage(circle);
  const moderators = getCircleModerators(circle);

  return (
    <div className="circle-card">
      <div className="circle-card-topline">
        <div className="circle-header">
          <span className="circle-icon">{circle.icon}</span>
          <div>
            <div className="circle-topic">{circle.topic}</div>
            <div className="circle-members">{circle.members.length} members · {circle.schedule}</div>
          </div>
        </div>
        <div className="circle-card-statuses">
          <NotificationBadge value={unreadCount > 0 ? unreadCount : ""} tone="accent" />
          <NotificationBadge live={liveNow} tone="success" />
        </div>
      </div>

      <div className="sp-sub circle-card-description">{circle.description}</div>
      <div className="circle-card-preview">
        <span className="sp-label">Latest group message</span>
        <p>
          {latestMessage
            ? <><strong>{latestMessage.author}:</strong> {latestMessage.text}</>
            : "This circle is open for people to join, listen, and begin the conversation together."}
        </p>
      </div>

      <div className="circle-card-meta-row">
        <div className="member-dots">
          {previewColors.map((color, index) => (
            <div key={`${circle.id}-${index}`} className="member-dot" style={{ background: color }} />
          ))}
          <span className="circle-card-inline-meta">
            {moderators.length} moderators · {circle.speakers.length} on the floor · {circle.requestQueue.length} hands raised
          </span>
        </div>
        <div className="circle-card-actions">
          {joined ? (
            <button className="join-btn" type="button" onClick={() => onOpenCircle(circle.id)}>
              Open Space
              <Icon.Forward />
            </button>
          ) : (
            <button className="join-btn" type="button" onClick={() => onJoinCircle(circle.id)}>
              Join Circle
              <Icon.Forward />
            </button>
          )}
          {showManage && (
            <button className="sp-btn sp-btn-ghost circle-manage-delete" type="button" onClick={() => onDeleteCircle(circle.id)}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function StepDots({ total, current }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`step-dot ${i < current ? "done" : i === current ? "current" : ""}`} />
      ))}
    </div>
  );
}

function ToggleSwitch({ on, onToggle }) {
  return (
    <button className={`toggle-switch ${on ? "on" : "off"}`} onClick={onToggle} type="button">
      <div className="toggle-knob" />
    </button>
  );
}

function ReactionBar({ reactions, reacted, onReact }) {
  return (
    <div className="reaction-bar">
      {[
        { id: "support", label: "Support", Ic: Icon.Support },
        { id: "relate",  label: "Relate",  Ic: Icon.Relate },
        { id: "hug",     label: "Hug",     Ic: Icon.Hug },
      ].map(({ id, label, Ic }) => (
        <button key={id} className={`reaction-btn ${reacted[id] ? "reacted" : ""}`} onClick={() => onReact(id)}>
          <Ic filled={!!reacted[id]} />
          {reactions[id]}
        </button>
      ))}
    </div>
  );
}

function PostCard({ post, onReact }) {
  const emotion = EMOTIONS.find(e => e.id === post.emotion);
  const visibilityLabel = post.visibility === "private"
    ? "Only you"
    : post.visibility === "circle"
      ? "Circle"
      : "Open";

  return (
    <div className="post-card">
      <div className="post-header">
        <div className="post-avatar" style={{ background: post.avatarBg }}>{post.avatar}</div>
        <div className="post-meta">
          <div className="post-username">{post.username}</div>
          <div className="post-meta-row">
            <div className="post-time">{post.time}</div>
            <span className={`post-visibility-tag ${post.visibility}`}>{visibilityLabel}</span>
          </div>
        </div>
        {emotion && <div className="post-emotion-tag">{emotion.icon} {emotion.label}</div>}
      </div>
      <div className="post-content">{post.content}</div>
      {post.reflection && (
        <div className="post-reflection">
          <Icon.Spark />
          <span>{post.reflection}</span>
        </div>
      )}
      <ReactionBar reactions={post.reactions} reacted={post.reacted} onReact={type => onReact(post.id, type)} />
    </div>
  );
}

function CrisisBanner() {
  return (
    <div className="crisis-banner">
      <div className="crisis-icon"><Icon.Crisis /></div>
      <div className="crisis-text">
        <strong>You do not have to carry this alone.</strong>
        If you are in a dark place right now, please reach out to someone who can truly help. Crisis support is available 24/7 - you deserve real care.
      </div>
    </div>
  );
}

// ─── VIEWS ────────────────────────────────────────────────────────────────────
function isPostOwnedByCurrentUser(post, currentUserId, username) {
  if (currentUserId && post.authorId) {
    return post.authorId === currentUserId;
  }

  return Boolean(username && post.username === username);
}

function HomeFeed({ posts, onReact, currentUserId, isGuest, username }) {
  const [feedTab, setFeedTab] = useState("open");
  const openPosts = posts.filter(post => post.visibility === "public");
  const circlePosts = posts.filter(post => post.visibility === "circle");
  const yourPosts = posts.filter(post => isPostOwnedByCurrentUser(post, currentUserId, username));
  const postsByTab = {
    open: openPosts,
    circle: circlePosts,
    yours: yourPosts,
  };
  const activePosts = postsByTab[feedTab] || [];
  const feedTabs = [
    { id: "open", label: "Open Feed", badge: openPosts.length > 0 ? String(openPosts.length) : "" },
    { id: "circle", label: "Circle Pulse", badge: circlePosts.length > 0 ? String(circlePosts.length) : "", badgeTone: "success" },
    { id: "yours", label: "Your Echoes", badge: yourPosts.length > 0 ? String(yourPosts.length) : "", badgeTone: "accent" },
  ];
  const activeFeedCopy = {
    open: {
      pill: "Open Feed",
      title: "Public check-ins from the wider room.",
      body: "These are the honest posts people chose to leave open for the whole SharePass community.",
      empty: "No open posts yet. When people share publicly, they will show up here.",
    },
    circle: {
      pill: "Circle Pulse",
      title: isGuest ? "Circle-only sharing opens after sign-in." : "Posts meant for closer community eyes.",
      body: isGuest
        ? "If you ever share for a closer space, your own post can still live here, but sign-in unlocks the wider circle community."
        : "This lane gathers posts people shared for the signed-in community instead of the full public feed.",
      empty: isGuest
        ? "Circle Pulse starts after sign-in. Once you unlock circles, those closer posts will collect here."
        : "No circle-only posts yet. When people share for the closer community, they will appear here.",
    },
    yours: {
      pill: "Your Echoes",
      title: "Everything you have shared, in one place.",
      body: "Public, circle, and personal posts you wrote stay grouped here so you can find your own voice quickly.",
      empty: "You have not shared a post yet. Your own check-ins will appear here after you publish one.",
    },
  }[feedTab];

  return (
    <div className="sp-panel">
      <div className="feed-header feed-header-stacked">
        <div>
          <div className="section-pill">{activeFeedCopy.pill}</div>
          <div className="sp-h1">{activeFeedCopy.title}</div>
          <div className="sp-sub">{activeFeedCopy.body}</div>
        </div>
      </div>
      <ViewTabs items={feedTabs} activeId={feedTab} onChange={setFeedTab} />
      {activePosts.length > 0 ? activePosts.map(p => (
        <PostCard key={p.id} post={p} onReact={onReact} />
      )) : (
        <div className="circle-empty-note">
          {activeFeedCopy.empty}
        </div>
      )}
    </div>
  );
}

function ExpressView({ onPostPublished }) {
  const [step, setStep] = useState(0);
  const [emotion, setEmotion] = useState(null);
  const [mode, setMode] = useState("vent");
  const [text, setText] = useState("");
  const [reflection, setReflection] = useState(null);
  const [reflecting, setReflecting] = useState(false);
  const [visibility, setVisibility] = useState("public");
  const [modResult, setModResult] = useState(null);
  const [crisisResult, setCrisisResult] = useState(null);
  const [typingHint, setTypingHint] = useState("");
  const [assistantNote, setAssistantNote] = useState("");
  const [publishError, setPublishError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const TOTAL = 5;

  const emotionObj = EMOTIONS.find(e => e.id === emotion);

  useEffect(() => {
    setTypingHint(text.length > 10 ? "Expressing something…" : "");
  }, [text]);

  const runAIReflection = async () => {
    if (!text.trim()) return;

    setReflecting(true);
    setReflection(null);
    setAssistantNote("");

    try {
      const response = await requestJson("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          task: "express",
          emotion,
          mode,
          text,
        }),
      });

      setModResult(response.moderation || null);
      setCrisisResult(response.crisis || null);
      setReflection(response.reflection || "");
      setAssistantNote(response.warning || "");
    } catch (error) {
      setModResult(null);
      setCrisisResult(null);
      setReflection("Your words still matter, even if the reflection service is unavailable for a moment. You can keep writing, edit gently, or share this exactly as it is.");
      setAssistantNote(error.message);
    } finally {
      setReflecting(false);
      setStep(3);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError("");

    try {
      await onPostPublished({
        emotion,
        content: text,
        reflection,
        visibility,
      });
    } catch (error) {
      setPublishError(error.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="sp-panel">
      <div style={{ marginBottom: 18 }}>
        <div className="sp-h1">Express Yourself</div>
        <div className="sp-sub">A guided space to put feelings into words, safely.</div>
      </div>
      <StepDots total={TOTAL} current={step} />

      {/* Step 0: Emotion */}
      <div className={`express-step ${step === 0 ? "active" : ""}`}>
        <div>
          <div className="sp-label">Step 1 — What are you feeling?</div>
          <div className="emotion-grid">
            {EMOTIONS.map(e => (
              <button key={e.id} className={`emotion-btn ${emotion === e.id ? "selected" : ""}`}
                onClick={() => setEmotion(e.id)} style={emotion === e.id ? { "--accent": e.color } : {}}>
                <span className="emotion-icon">{e.icon}</span>{e.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sp-input-row">
          <button className="sp-btn sp-btn-primary" disabled={!emotion} onClick={() => setStep(1)}>
            Continue <Icon.Forward />
          </button>
        </div>
      </div>

      {/* Step 1: Mode */}
      <div className={`express-step ${step === 1 ? "active" : ""}`}>
        <div>
          <div className="sp-label">Step 2 — What do you need?</div>
          <div className="mode-pills">
            {[["vent","Just Vent"],["reflect","Help Me Reflect"],["advice","I Want Advice"]].map(([id, label]) => (
              <button key={id} className={`mode-pill ${mode === id ? "active" : ""}`} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="sp-input-row">
          <button className="sp-btn sp-btn-ghost" onClick={() => setStep(0)}><Icon.Back /> Back</button>
          <button className="sp-btn sp-btn-primary" onClick={() => setStep(2)}>Continue <Icon.Forward /></button>
        </div>
      </div>

      {/* Step 2: Write */}
      <div className={`express-step ${step === 2 ? "active" : ""}`}>
        <div>
          <div className="sp-label">Step 3 — Write freely {emotionObj && `· ${emotionObj.icon} ${emotionObj.label}`}</div>
          <textarea className="safe-editor"
            placeholder={mode === "vent" ? "Let it out. Nobody is judging here…" : mode === "reflect" ? "Describe what's happening inside you…" : "Tell me what's going on and I'll help you think through it…"}
            value={text} onChange={e => setText(e.target.value)} rows={6} />
          <div className="typing-indicator">{typingHint}</div>
        </div>
        {reflecting && (
          <div className="reflection-box">
            <div className="reflection-loading">
              <div className="pulse-dot"/><div className="pulse-dot"/><div className="pulse-dot"/>
              <span>Processing your feelings…</span>
            </div>
          </div>
        )}
        {assistantNote && <div className="inline-note">{assistantNote}</div>}
        <div className="sp-input-row">
          <button className="sp-btn sp-btn-ghost" onClick={() => setStep(1)}><Icon.Back /> Back</button>
          <button className="sp-btn sp-btn-primary" disabled={text.trim().length < 10 || reflecting} onClick={runAIReflection}>
            {reflecting ? "Listening…" : <><Icon.Spark /> Get Reflection</>}
          </button>
        </div>
      </div>

      {/* Step 3: Reflection */}
      <div className={`express-step ${step === 3 ? "active" : ""}`}>
        <div>
          <div className="sp-label">Step 4 — AI Reflection</div>
          {crisisResult?.crisis && crisisResult.level !== "low" && <CrisisBanner />}
          {reflection && <div className="reflection-box"><div className="reflection-text">{reflection}</div></div>}
          {modResult && !modResult.safe && (
            <div className="tone-note">
              <strong style={{ color: "var(--accent)", display: "block", marginBottom: 3, fontSize: 12, fontWeight: 600 }}>Tone Note</strong>
              {modResult.reason} - would you like to soften this before sharing?
            </div>
          )}
          {assistantNote && <div className="inline-note">{assistantNote}</div>}
        </div>
        <div className="sp-input-row">
          <button className="sp-btn sp-btn-ghost" onClick={() => setStep(2)}><Icon.Back /> Edit</button>
          <button className="sp-btn sp-btn-primary" onClick={() => setStep(4)}>Choose Visibility <Icon.Forward /></button>
        </div>
      </div>

      {/* Step 4: Visibility */}
      <div className={`express-step ${step === 4 ? "active" : ""}`}>
        <div>
          <div className="sp-label">Step 5 — Who can see this?</div>
          <div className="vis-options">
            {[
              { id: "public", label: "Public", renderIcon: () => <Icon.Globe /> },
              { id: "circle", label: "My Circle", renderIcon: () => <Icon.Circles active={false} /> },
              { id: "private", label: "Just Me", renderIcon: () => <Icon.Lock /> },
            ].map(({ id, label, renderIcon }) => (
              <button key={id} className={`vis-btn ${visibility === id ? "selected" : ""}`} onClick={() => setVisibility(id)}>
                {renderIcon()}
                {label}
              </button>
            ))}
          </div>
        </div>
        {publishError && <div className="inline-note inline-note-error">{publishError}</div>}
        <div className="sp-input-row">
          <button className="sp-btn sp-btn-ghost" onClick={() => setStep(3)}><Icon.Back /> Back</button>
          <button className="sp-btn sp-btn-primary" disabled={publishing} onClick={handlePublish}>
            {publishing ? "Sharing…" : <><Icon.Spark /> Share</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function AIChat({ onBack }) {
  const [messages, setMessages] = useState([
    { role: "ai", text: "I’m here with you. You can vent, slow things down, or ask me to help make sense of what’s sitting on your chest." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("vent");
  const [assistantNote, setAssistantNote] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("Checking voice input…");
  const [isListening, setIsListening] = useState(false);
  const endRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const manualStopRef = useRef(false);
  const listeningBaseRef = useRef("");
  const finalTranscriptRef = useRef("");
  const capturedSpeechRef = useRef(false);
  const maxComposerHeight = 168;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const resizeComposer = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, maxComposerHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxComposerHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [input, resizeComposer]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setSpeechStatus("Voice listening works in supported browsers like Chrome or Safari.");
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setSpeechStatus("Listening now. Speak naturally.");
    };

    recognition.onresult = event => {
      let finalChunk = "";
      let interimChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript?.trim();
        if (!transcript) continue;

        if (event.results[i].isFinal) {
          finalChunk += `${transcript} `;
        } else {
          interimChunk += `${transcript} `;
        }
      }

      if (finalChunk) {
        finalTranscriptRef.current += finalChunk;
        capturedSpeechRef.current = true;
      }

      const nextValue = [
        listeningBaseRef.current.trim(),
        finalTranscriptRef.current.trim(),
        interimChunk.trim(),
      ].filter(Boolean).join(" ");

      setInput(nextValue);
    };

    recognition.onerror = event => {
      manualStopRef.current = true;
      setIsListening(false);

      if (event.error === "not-allowed") {
        setSpeechStatus("Microphone access was blocked. Allow mic permission and try again.");
      } else if (event.error === "audio-capture") {
        setSpeechStatus("No microphone was detected on this device.");
      } else if (event.error === "no-speech") {
        setSpeechStatus("I couldn't hear anything that time. Try speaking a little closer.");
      } else {
        setSpeechStatus("Voice listening ran into a problem. You can still type instead.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);

      if (manualStopRef.current) {
        manualStopRef.current = false;
      }

      if (capturedSpeechRef.current) {
        setSpeechStatus("Voice input added. You can keep editing before sending.");
      } else {
        setSpeechStatus("Tap the mic to try voice input again.");
      }
    };

    recognitionRef.current = recognition;
    setSpeechSupported(true);
    setSpeechStatus("Tap the mic to speak instead of typing.");

    return () => {
      manualStopRef.current = true;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    if (recognitionRef.current && isListening) {
      manualStopRef.current = true;
      recognitionRef.current.stop();
    }

    const userMsg = input.trim();
    const nextHistory = [...messages, { role: "user", text: userMsg }];

    setInput("");
    setAssistantNote("");
    setMessages(nextHistory);
    setLoading(true);

    try {
      const response = await requestJson("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          task: "chat",
          mode,
          messages: nextHistory,
        }),
      });

      setMessages(currentMessages => [...currentMessages, { role: "ai", text: response.reply }]);
      setAssistantNote(response.warning || "");
    } catch (error) {
      setMessages(currentMessages => [
        ...currentMessages,
        { role: "ai", text: "I’m still here with you. The assistant connection slipped for a moment, so please try again in a second." },
      ]);
      setAssistantNote(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current || loading) return;

    if (isListening) {
      manualStopRef.current = true;
      recognitionRef.current.stop();
      setSpeechStatus("Listening paused. Your words are still in the message box.");
      return;
    }

    listeningBaseRef.current = input.trim();
    finalTranscriptRef.current = "";
    capturedSpeechRef.current = false;
    manualStopRef.current = false;

    try {
      recognitionRef.current.start();
    } catch {
      setSpeechStatus("Voice listening is already starting. Give it a second.");
    }
  };

  return (
    <div className="sp-panel chat-screen">
      <div className="chat-hero">
        <div className="chat-hero-top">
          <button className="chat-back-btn" onClick={onBack} type="button">
            <Icon.Back />
            <span>Back</span>
          </button>
          <div className="section-pill">AI Assistant</div>
        </div>
        <div className="sp-h1">Talk it through gently.</div>
        <div className="sp-sub">A calm companion that listens first, reflects clearly, and keeps the pace soft.</div>
        <div className="assistant-presence-card">
          <div className="assistant-presence-orb" aria-hidden="true">
            <span className="assistant-presence-core" />
            <span className="assistant-presence-ring assistant-presence-ring-one" />
            <span className="assistant-presence-ring assistant-presence-ring-two" />
          </div>
          <div className="assistant-presence-copy">
            <span className="assistant-presence-kicker">Live Companion</span>
            <strong>Listening mode shifts with your pace.</strong>
            <p>Vent for warmth, reflect for clarity, or ask for one simple next step at a time.</p>
          </div>
          <div className="assistant-presence-status">
            <span className="assistant-presence-dot" />
            Ready
          </div>
        </div>
        <div className="assistant-glance-row">
          {["Vent first", "Reflect softly", "One-step advice"].map(item => (
            <div key={item} className="assistant-glance-pill">{item}</div>
          ))}
        </div>
        <div className="mode-pills assistant-mode-pills">
          {[["vent","Just Vent"],["reflect","Reflect"],["advice","Advice"]].map(([id, label]) => (
            <button key={id} className={`mode-pill ${mode === id ? "active" : ""}`} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        <div className={`chat-voice-status ${isListening ? "listening" : speechSupported ? "ready" : "disabled"}`}>
          <Icon.Mic active={isListening} />
          <span>{speechStatus}</span>
        </div>
        {assistantNote && <div className="inline-note">{assistantNote}</div>}
      </div>
      <div className="chat-shell">
        <div className="chat-messages">
          {messages.map((m, i) => <div key={i} className={`chat-bubble ${m.role}`}>{m.text}</div>)}
          {loading && (
            <div className="chat-bubble ai">
              <div className="reflection-loading" style={{ gap: 6 }}>
                <div className="pulse-dot"/><div className="pulse-dot"/><div className="pulse-dot"/>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-input chat-input-multiline"
            placeholder="Say anything…"
            value={input}
            rows={1}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className={`chat-mic-btn ${isListening ? "listening" : ""}`}
            onClick={toggleListening}
            disabled={!speechSupported || loading}
            type="button"
            title={speechSupported ? (isListening ? "Stop listening" : "Start listening") : "Voice input unavailable"}
          >
            <Icon.Mic active={isListening} />
          </button>
          <button className="chat-send-btn" onClick={send} disabled={loading || !input.trim()}>
            <Icon.Send />
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessGateView({ title, body, onRequireAccount }) {
  return (
    <div className="sp-panel">
      <div className="sp-card access-gate-card">
        <div className="section-pill">
          <Icon.Lock />
          Sign-In Required
        </div>
        <div className="sp-h1">{title}</div>
        <div className="sp-sub" style={{ marginBottom: 18 }}>
          {body}
        </div>
        <button className="sp-btn sp-btn-primary" type="button" onClick={onRequireAccount}>
          View Login Options
          <Icon.Rise />
        </button>
      </div>
    </div>
  );
}

function getMoodMeta(moodId) {
  return EMOTIONS.find(emotion => emotion.id === moodId) || EMOTIONS[0];
}

function CircleMemberRow({ member, badge, actions = [] }) {
  const mood = getMoodMeta(member.mood);

  return (
    <div className="circle-member-row">
      <div className="circle-member-main">
        <span className="circle-member-avatar" style={{ background: member.color }}>
          {member.name.charAt(0).toUpperCase()}
        </span>
        <div className="circle-member-copy">
          <strong>{member.name}</strong>
          <span>{mood.icon} {mood.label}</span>
        </div>
      </div>
      {badge && <span className="circle-member-badge">{badge}</span>}
      {actions.length > 0 && (
        <div className="circle-member-actions">
          {actions.map(action => (
            <button
              key={`${member.id}-${action.label}`}
              className={`join-btn circle-member-action ${action.tone === "danger" ? "circle-member-action-danger" : ""}`}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CircleMessageRow({ message }) {
  const isAnnouncement = message.type === "announcement";
  const authorLabel = message.authorRole === "moderator"
    ? "Moderator"
    : message.authorRole === "member"
      ? "Member"
      : "";

  return (
    <div className={`circle-chat-row ${isAnnouncement ? "announcement" : ""}`}>
      <div className={`circle-chat-avatar ${isAnnouncement ? "announcement" : ""}`}>
        {isAnnouncement ? <Icon.Shield /> : message.author.charAt(0).toUpperCase()}
      </div>
      <div className="circle-chat-bubble">
        <div className="circle-chat-meta">
          <div className="circle-chat-author-line">
            <strong>{message.author}</strong>
            {authorLabel ? <span className="circle-chat-author-badge">{authorLabel}</span> : null}
          </div>
          <span>{formatRelativeTime(message.createdAt)}</span>
        </div>
        <p>{message.text}</p>
      </div>
    </div>
  );
}

function CircleVoicePanel({
  activeCircle,
  canModerateRoom,
  currentMember,
  currentUserId,
  onRoomSnapshotChange,
  onToggleVoiceSession,
  sessionProfile,
}) {
  const [voiceRoom, setVoiceRoom] = useState({
    active: Boolean(activeCircle.voiceSession?.active),
    startedAt: activeCircle.voiceSession?.startedAt || "",
    participants: [],
    signals: [],
    updatedAt: activeCircle.voiceSession?.updatedAt || "",
  });
  const [audioJoined, setAudioJoined] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [clockNowMs, setClockNowMs] = useState(Date.now());
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [remoteAudioLevels, setRemoteAudioLevels] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const pendingIceCandidatesRef = useRef({});
  const processedSignalIdsRef = useRef(new Set());
  const remoteAudioRefs = useRef({});
  const audioContextRef = useRef(null);
  const analyserEntriesRef = useRef({});
  const meterFrameRef = useRef(null);
  const activeCircleId = activeCircle.id;
  const voiceParticipants = Array.isArray(voiceRoom.participants) ? voiceRoom.participants : EMPTY_ITEMS;
  const connectedParticipants = voiceParticipants.length;
  const connectedListeners = voiceParticipants.filter(participant => !participant.onFloor && !participant.isModerator);
  const floorStartedAt = activeCircle.voiceSession?.startedAt || voiceRoom.startedAt || "";

  useEffect(() => {
    onRoomSnapshotChange?.({
      circleId: activeCircleId,
      active: Boolean(activeCircle.voiceSession?.active || voiceRoom.active),
      startedAt: floorStartedAt,
      participants: voiceParticipants,
      updatedAt: voiceRoom.updatedAt || activeCircle.voiceSession?.updatedAt || "",
    });
  }, [
    activeCircle.voiceSession?.active,
    activeCircle.voiceSession?.updatedAt,
    activeCircleId,
    floorStartedAt,
    onRoomSnapshotChange,
    voiceParticipants,
    voiceRoom.active,
    voiceRoom.updatedAt,
  ]);

  const closePeerConnection = useCallback(remoteMemberId => {
    const connection = peerConnectionsRef.current[remoteMemberId];

    if (connection) {
      connection.ontrack = null;
      connection.onicecandidate = null;
      connection.onconnectionstatechange = null;
      connection.close();
      delete peerConnectionsRef.current[remoteMemberId];
    }

    delete pendingIceCandidatesRef.current[remoteMemberId];
    setRemoteStreams(currentStreams => {
      if (!currentStreams[remoteMemberId]) {
        return currentStreams;
      }

      const nextStreams = { ...currentStreams };
      delete nextStreams[remoteMemberId];
      return nextStreams;
    });
  }, []);

  const resetAudioAnalysis = useCallback(() => {
    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }

    Object.values(analyserEntriesRef.current).forEach(entry => {
      try {
        entry?.source?.disconnect();
      } catch {
        // Ignore analyser cleanup failures during teardown.
      }
    });

    analyserEntriesRef.current = {};
    setLocalAudioLevel(0);
    setRemoteAudioLevels({});

    if (audioContextRef.current) {
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      void audioContext.close().catch(() => null);
    }
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    if (audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch (error) {
        console.error("Failed to resume audio context", error);
      }
    }

    return audioContextRef.current;
  }, []);

  const disconnectMemberAnalyser = useCallback((memberId, { clearRemoteLevel = true } = {}) => {
    const currentEntry = analyserEntriesRef.current[memberId];

    if (currentEntry) {
      try {
        currentEntry.source?.disconnect();
      } catch {
        // Ignore analyser cleanup failures during teardown.
      }

      delete analyserEntriesRef.current[memberId];
    }

    if (memberId === currentUserId) {
      setLocalAudioLevel(0);
      return;
    }

    if (clearRemoteLevel) {
      setRemoteAudioLevels(currentLevels => {
        if (!(memberId in currentLevels)) {
          return currentLevels;
        }

        const nextLevels = { ...currentLevels };
        delete nextLevels[memberId];
        return nextLevels;
      });
    }
  }, [currentUserId]);

  const attachStreamAnalyser = useCallback(async (memberId, stream) => {
    if (!memberId || !stream || stream.getAudioTracks().length === 0) {
      return;
    }

    const audioContext = await ensureAudioContext();

    if (!audioContext) {
      return;
    }

    const existingEntry = analyserEntriesRef.current[memberId];

    if (existingEntry?.stream === stream) {
      return;
    }

    disconnectMemberAnalyser(memberId, { clearRemoteLevel: false });

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.84;
    source.connect(analyser);

    analyserEntriesRef.current[memberId] = {
      stream,
      source,
      analyser,
      sampleBuffer: new Uint8Array(analyser.frequencyBinCount),
    };
  }, [disconnectMemberAnalyser, ensureAudioContext]);

  const syncCurrentParticipantMute = useCallback(nextMuted => {
    setVoiceRoom(currentRoom => ({
      ...currentRoom,
      participants: currentRoom.participants.map(participant => (
        participant.memberId === currentUserId
          ? { ...participant, muted: nextMuted }
          : participant
      )),
    }));
  }, [currentUserId]);

  const applyMuteState = useCallback(nextMuted => {
    const nextEnabled = !nextMuted;

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = nextEnabled;
      });
    }

    Object.values(peerConnectionsRef.current).forEach(connection => {
      connection.getSenders().forEach(sender => {
        if (sender.track?.kind === "audio") {
          sender.track.enabled = nextEnabled;
        }
      });
    });

    if (!nextEnabled) {
      setLocalAudioLevel(0);
    }
  }, []);

  const detachAudioRoom = useCallback(({ status = "", error = "", clearParticipants = false } = {}) => {
    Object.keys(peerConnectionsRef.current).forEach(remoteMemberId => {
      const connection = peerConnectionsRef.current[remoteMemberId];

      if (connection) {
        connection.ontrack = null;
        connection.onicecandidate = null;
        connection.onconnectionstatechange = null;
        connection.close();
      }
    });

    peerConnectionsRef.current = {};
    pendingIceCandidatesRef.current = {};
    processedSignalIdsRef.current = new Set();
    Object.values(remoteAudioRefs.current).forEach(node => {
      if (node) {
        node.srcObject = null;
      }
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    resetAudioAnalysis();
    setRemoteStreams({});
    setAudioJoined(false);
    setAudioBusy(false);
    setMicMuted(false);
    setVoiceRoom(currentRoom => ({
      ...currentRoom,
      active: Boolean(activeCircle.voiceSession?.active),
      startedAt: activeCircle.voiceSession?.startedAt || currentRoom.startedAt || "",
      signals: [],
      participants: clearParticipants ? [] : currentRoom.participants,
    }));
    setVoiceStatus(status);
    setVoiceError(error);
  }, [activeCircle.voiceSession?.active, activeCircle.voiceSession?.startedAt, resetAudioAnalysis]);

  const postVoiceAction = useCallback(async (action, extra = {}) => {
    const response = await requestJson("/api/circle-voice", {
      method: "POST",
      body: JSON.stringify({
        action,
        circleId: activeCircleId,
        sessionProfile,
        ...extra,
      }),
    });

    if (response.room) {
      setVoiceRoom(response.room);
    }

    return response.room || null;
  }, [activeCircleId, sessionProfile]);

  const leaveAudioRoom = useCallback(async ({ notifyServer = true, status = "You left the audio room." } = {}) => {
    if (notifyServer) {
      try {
        await postVoiceAction("leave");
      } catch (error) {
        console.error("Failed to leave audio room", error);
      }
    }

    detachAudioRoom({ status });
  }, [detachAudioRoom, postVoiceAction]);

  const fetchVoiceRoom = useCallback(async () => {
    if (!activeCircleId || !sessionProfile?.email) {
      return null;
    }

    const query = new URLSearchParams({
      circleId: activeCircleId,
      email: sessionProfile.email || "",
      username: sessionProfile.username || "",
      displayName: sessionProfile.displayName || "",
    });
    const response = await requestJson(`/api/circle-voice?${query.toString()}`);

    if (response.room) {
      setVoiceRoom(response.room);

      if (!response.room.active && (audioJoined || localStreamRef.current)) {
        detachAudioRoom({ status: "The moderator ended the live audio room.", clearParticipants: true });
      }
    }

    return response.room || null;
  }, [activeCircleId, audioJoined, detachAudioRoom, sessionProfile]);

  const sendLeaveBeacon = useCallback(() => {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
      return;
    }

    try {
      const payload = JSON.stringify({
        action: "leave",
        circleId: activeCircleId,
        sessionProfile,
      });

      navigator.sendBeacon("/api/circle-voice", new Blob([payload], { type: "application/json" }));
    } catch (error) {
      console.error("Failed to send voice leave beacon", error);
    }
  }, [activeCircleId, sessionProfile]);

  const sendSignal = useCallback(async (toMemberId, type, payload) => {
    await postVoiceAction("signal", {
      id: createVoiceClientId("signal"),
      toMemberId,
      type,
      payload,
      muted: micMuted,
    });
  }, [micMuted, postVoiceAction]);

  const flushPendingIceCandidates = useCallback(async remoteMemberId => {
    const connection = peerConnectionsRef.current[remoteMemberId];

    if (!connection?.remoteDescription) {
      return;
    }

    const pendingCandidates = pendingIceCandidatesRef.current[remoteMemberId] || [];

    while (pendingCandidates.length > 0) {
      const nextCandidate = pendingCandidates.shift();

      try {
        await connection.addIceCandidate(new RTCIceCandidate(nextCandidate));
      } catch (error) {
        console.error("Failed to apply queued ICE candidate", error);
      }
    }
  }, []);

  const ensurePeerConnection = useCallback(async (remoteMemberId, initiateOffer = false) => {
    if (!remoteMemberId || remoteMemberId === currentUserId) {
      return null;
    }

    if (peerConnectionsRef.current[remoteMemberId]) {
      return peerConnectionsRef.current[remoteMemberId];
    }

    if (typeof window === "undefined" || typeof window.RTCPeerConnection === "undefined") {
      throw new Error("This browser cannot open the live audio room.");
    }

    const connection = new RTCPeerConnection(WEBRTC_CONFIG);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        connection.addTrack(track, localStreamRef.current);
      });
    }

    connection.ontrack = event => {
      const [remoteStream] = event.streams;

      if (!remoteStream) {
        return;
      }

      setRemoteStreams(currentStreams => (
        currentStreams[remoteMemberId] === remoteStream
          ? currentStreams
          : { ...currentStreams, [remoteMemberId]: remoteStream }
      ));
    };

    connection.onicecandidate = event => {
      if (!event.candidate) {
        return;
      }

      const candidatePayload = typeof event.candidate.toJSON === "function"
        ? event.candidate.toJSON()
        : event.candidate;

      void sendSignal(remoteMemberId, "ice", candidatePayload).catch(error => {
        console.error("Failed to send ICE candidate", error);
      });
    };

    connection.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(connection.connectionState)) {
        closePeerConnection(remoteMemberId);
        return;
      }

      if (connection.connectionState === "disconnected") {
        window.setTimeout(() => {
          const currentConnection = peerConnectionsRef.current[remoteMemberId];

          if (currentConnection?.connectionState === "disconnected") {
            closePeerConnection(remoteMemberId);
          }
        }, 2200);
      }
    };

    pendingIceCandidatesRef.current[remoteMemberId] = pendingIceCandidatesRef.current[remoteMemberId] || [];
    peerConnectionsRef.current[remoteMemberId] = connection;

    if (initiateOffer) {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const offerPayload = typeof connection.localDescription?.toJSON === "function"
        ? connection.localDescription.toJSON()
        : connection.localDescription;

      if (offerPayload) {
        await sendSignal(remoteMemberId, "offer", offerPayload);
      }
    }

    return connection;
  }, [closePeerConnection, currentUserId, sendSignal]);

  const handleJoinAudio = useCallback(async () => {
    if (!currentMember) {
      setVoiceError("Join the circle first so your audio room presence is tied to your room identity.");
      return;
    }

    if (!activeCircle.voiceSession?.active) {
      setVoiceError("Wait for a moderator to start the live voice floor before joining audio.");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError("This browser cannot start a live microphone room.");
      return;
    }

    setAudioBusy(true);
    setVoiceError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const [audioTrack] = stream.getAudioTracks();

      if (audioTrack) {
        audioTrack.enabled = !micMuted;
      }

      localStreamRef.current = stream;
      applyMuteState(micMuted);
      await postVoiceAction("join", { muted: micMuted });
      setAudioJoined(true);
      setVoiceStatus("You are connected to the live audio room.");
      await fetchVoiceRoom();
    } catch (error) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      const message = String(error?.message || "");
      setVoiceError(
        /permission|denied|blocked/i.test(message)
          ? "Microphone access was blocked. Allow mic permission and try again."
          : "The live audio room could not start. Please check your microphone and try again.",
      );
    } finally {
      setAudioBusy(false);
    }
  }, [activeCircle.voiceSession?.active, applyMuteState, currentMember, fetchVoiceRoom, micMuted, postVoiceAction]);

  const handleToggleMute = useCallback(async () => {
    if (!audioJoined || !localStreamRef.current) {
      return;
    }

    const nextMuted = !micMuted;

    applyMuteState(nextMuted);
    setMicMuted(nextMuted);
    setVoiceError("");
    syncCurrentParticipantMute(nextMuted);

    try {
      await postVoiceAction("set-muted", { muted: nextMuted });
      setVoiceStatus(nextMuted ? "Your microphone is muted." : "Your microphone is live.");
    } catch (error) {
      applyMuteState(micMuted);
      setMicMuted(micMuted);
      syncCurrentParticipantMute(micMuted);
      setVoiceError(error.message || "The microphone state could not be updated right now.");
    }
  }, [applyMuteState, audioJoined, micMuted, postVoiceAction, syncCurrentParticipantMute]);

  const bindRemoteAudioRef = useCallback((memberId, node) => {
    if (node) {
      remoteAudioRefs.current[memberId] = node;
      return;
    }

    delete remoteAudioRefs.current[memberId];
  }, []);

  useEffect(() => {
    Object.entries(remoteAudioRefs.current).forEach(([memberId, node]) => {
      if (!node) {
        return;
      }

      const remoteStream = remoteStreams[memberId];

      if (remoteStream) {
        if (node.srcObject !== remoteStream) {
          node.srcObject = remoteStream;
        }

        if (node.muted) {
          node.muted = false;
        }

        const maybePromise = node.play?.();
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch(() => null);
        }
      } else if (node.srcObject) {
        node.srcObject = null;
      }
    });
  }, [remoteStreams]);

  useEffect(() => {
    if (!activeCircle.voiceSession?.active && voiceParticipants.length === 0) {
      return undefined;
    }

    setClockNowMs(Date.now());

    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeCircle.voiceSession?.active, voiceParticipants.length]);

  useEffect(() => {
    if (!audioJoined || !localStreamRef.current) {
      disconnectMemberAnalyser(currentUserId);
      return undefined;
    }

    void attachStreamAnalyser(currentUserId, localStreamRef.current);

    return () => {
      disconnectMemberAnalyser(currentUserId);
    };
  }, [attachStreamAnalyser, audioJoined, currentUserId, disconnectMemberAnalyser]);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([memberId, stream]) => {
      void attachStreamAnalyser(memberId, stream);
    });

    Object.keys(analyserEntriesRef.current).forEach(memberId => {
      if (memberId !== currentUserId && !remoteStreams[memberId]) {
        disconnectMemberAnalyser(memberId);
      }
    });
  }, [attachStreamAnalyser, currentUserId, disconnectMemberAnalyser, remoteStreams]);

  useEffect(() => {
    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }

    const tickLevels = () => {
      let nextLocalLevel = 0;
      const nextRemoteLevels = {};

      Object.entries(analyserEntriesRef.current).forEach(([memberId, entry]) => {
        const participant = voiceParticipants.find(item => item.memberId === memberId);
        const isLocalParticipant = memberId === currentUserId;
        const isMuted = isLocalParticipant ? micMuted : Boolean(participant?.muted);
        const measuredLevel = isMuted ? 0 : measureAnalyserLevel(entry.analyser, entry.sampleBuffer);

        if (isLocalParticipant) {
          nextLocalLevel = measuredLevel;
        } else {
          nextRemoteLevels[memberId] = measuredLevel;
        }
      });

      setLocalAudioLevel(nextLocalLevel);
      setRemoteAudioLevels(currentLevels => {
        const nextKeys = Object.keys(nextRemoteLevels);
        const currentKeys = Object.keys(currentLevels);

        if (nextKeys.length === currentKeys.length && nextKeys.every(key => Math.abs((currentLevels[key] || 0) - (nextRemoteLevels[key] || 0)) < 0.025)) {
          return currentLevels;
        }

        return nextRemoteLevels;
      });

      meterFrameRef.current = window.requestAnimationFrame(tickLevels);
    };

    meterFrameRef.current = window.requestAnimationFrame(tickLevels);

    return () => {
      if (meterFrameRef.current) {
        window.cancelAnimationFrame(meterFrameRef.current);
        meterFrameRef.current = null;
      }
    };
  }, [currentUserId, micMuted, voiceParticipants]);

  useEffect(() => {
    if (!activeCircle.voiceSession?.active || !sessionProfile?.email || !currentMember) {
      return undefined;
    }

    let active = true;

    const syncVoiceRoom = async () => {
      try {
        const room = await fetchVoiceRoom();

        if (!active || !room) {
          return;
        }

        if (!room.active && (audioJoined || localStreamRef.current)) {
          detachAudioRoom({ status: "The moderator ended the live audio room.", clearParticipants: true });
        }
      } catch (error) {
        if (active) {
          console.error("Failed to sync voice room", error);
        }
      }
    };

    void syncVoiceRoom();

    const intervalId = window.setInterval(() => {
      void syncVoiceRoom();
    }, VOICE_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [activeCircle.voiceSession?.active, audioJoined, currentMember, detachAudioRoom, fetchVoiceRoom, sessionProfile]);

  useEffect(() => {
    if (!audioJoined || !activeCircle.voiceSession?.active) {
      return undefined;
    }

    const heartbeat = () => {
      void postVoiceAction("heartbeat", { muted: micMuted }).catch(error => {
        console.error("Voice heartbeat failed", error);
      });
    };

    heartbeat();

    const intervalId = window.setInterval(heartbeat, VOICE_HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeCircle.voiceSession?.active, audioJoined, micMuted, postVoiceAction]);

  useEffect(() => {
    if (!audioJoined || !activeCircle.voiceSession?.active) {
      return;
    }

    const remoteMemberIds = voiceParticipants
      .map(participant => participant.memberId)
      .filter(memberId => memberId && memberId !== currentUserId);

    remoteMemberIds.forEach(remoteMemberId => {
      if (!peerConnectionsRef.current[remoteMemberId] && currentUserId.localeCompare(remoteMemberId) < 0) {
        void ensurePeerConnection(remoteMemberId, true).catch(error => {
          console.error("Failed to open voice connection", error);
          setVoiceError("A participant connection could not be opened. The room will keep retrying.");
        });
      }
    });

    Object.keys(peerConnectionsRef.current).forEach(remoteMemberId => {
      if (!remoteMemberIds.includes(remoteMemberId)) {
        closePeerConnection(remoteMemberId);
      }
    });
  }, [activeCircle.voiceSession?.active, audioJoined, closePeerConnection, currentUserId, ensurePeerConnection, voiceParticipants]);

  useEffect(() => {
    if (!audioJoined || !Array.isArray(voiceRoom.signals) || voiceRoom.signals.length === 0) {
      return undefined;
    }

    let cancelled = false;

    const processSignals = async () => {
      const acknowledgedSignals = [];

      for (const signal of voiceRoom.signals) {
        if (cancelled || processedSignalIdsRef.current.has(signal.id)) {
          continue;
        }

        processedSignalIdsRef.current.add(signal.id);

        try {
          if (signal.fromMemberId === currentUserId) {
            acknowledgedSignals.push(signal.id);
            continue;
          }

          if (signal.type === "offer") {
            const connection = await ensurePeerConnection(signal.fromMemberId, false);

            if (!connection) {
              continue;
            }

            await connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
            await flushPendingIceCandidates(signal.fromMemberId);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            const answerPayload = typeof connection.localDescription?.toJSON === "function"
              ? connection.localDescription.toJSON()
              : connection.localDescription;

            if (answerPayload) {
              await sendSignal(signal.fromMemberId, "answer", answerPayload);
            }
          }

          if (signal.type === "answer") {
            const connection = peerConnectionsRef.current[signal.fromMemberId] || await ensurePeerConnection(signal.fromMemberId, false);

            if (!connection) {
              continue;
            }

            await connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
            await flushPendingIceCandidates(signal.fromMemberId);
          }

          if (signal.type === "ice") {
            const connection = peerConnectionsRef.current[signal.fromMemberId] || await ensurePeerConnection(signal.fromMemberId, false);

            if (!connection) {
              continue;
            }

            if (connection.remoteDescription) {
              await connection.addIceCandidate(new RTCIceCandidate(signal.payload));
            } else {
              pendingIceCandidatesRef.current[signal.fromMemberId] = [
                ...(pendingIceCandidatesRef.current[signal.fromMemberId] || []),
                signal.payload,
              ];
            }
          }

          acknowledgedSignals.push(signal.id);
        } catch (error) {
          console.error("Failed to process voice signal", error);
        }
      }

      if (acknowledgedSignals.length > 0) {
        try {
          await postVoiceAction("ack-signals", { signalIds: acknowledgedSignals });
        } catch (error) {
          console.error("Failed to acknowledge voice signals", error);
        }
      }
    };

    void processSignals();

    return () => {
      cancelled = true;
    };
  }, [audioJoined, currentUserId, ensurePeerConnection, flushPendingIceCandidates, postVoiceAction, sendSignal, voiceRoom.signals]);

  useEffect(() => {
    if (currentMember || (!audioJoined && !localStreamRef.current)) {
      return;
    }

    detachAudioRoom({ status: "You are no longer in this circle, so the audio room was closed." });
  }, [audioJoined, currentMember, detachAudioRoom]);

  useEffect(() => {
    if (activeCircle.voiceSession?.active || (!audioJoined && !localStreamRef.current)) {
      return;
    }

    detachAudioRoom({ status: "The moderator ended the live audio room.", clearParticipants: true });
  }, [activeCircle.voiceSession?.active, audioJoined, detachAudioRoom]);

  useEffect(() => {
    if (!audioJoined) {
      return undefined;
    }

    const handlePageHide = () => {
      sendLeaveBeacon();
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [audioJoined, sendLeaveBeacon]);

  useEffect(() => () => {
    if (audioJoined || localStreamRef.current) {
      void requestJson("/api/circle-voice", {
        method: "POST",
        body: JSON.stringify({
          action: "leave",
          circleId: activeCircleId,
          sessionProfile,
        }),
      }).catch(() => null);
    }

    Object.values(peerConnectionsRef.current).forEach(connection => {
      connection?.close();
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    resetAudioAnalysis();
  }, [activeCircleId, audioJoined, resetAudioAnalysis, sessionProfile]);

  const floorElapsedLabel = activeCircle.voiceSession?.active
    ? formatElapsedDuration(floorStartedAt, clockNowMs)
    : "00:00";
  const liveMicCount = voiceParticipants.filter(participant => !participant.muted).length;
  const roomMotionLevel = Math.max(localAudioLevel, ...Object.values(remoteAudioLevels));
  const featuredParticipant = voiceParticipants.reduce((bestMatch, participant) => {
    if (participant.muted) {
      return bestMatch;
    }

    const participantLevel = participant.memberId === currentUserId
      ? localAudioLevel
      : (remoteAudioLevels[participant.memberId] || 0);

    if (!bestMatch || participantLevel > bestMatch.level) {
      return {
        level: participantLevel,
        participant,
      };
    }

    return bestMatch;
  }, null);

  return (
    <div className="sp-card circle-voice-card">
      <div className="circle-card-head">
        <div>
          <div className="sp-label">Live Audio Room</div>
          <div className="sp-h2">Real-time voice inside this circle</div>
          <div className="sp-sub">
            When the voice floor is live, members can join the audio room, hear each other in real time, and keep the conversation audio-only like a lightweight meeting room.
          </div>
        </div>
        <div className="circle-card-statuses">
          <NotificationBadge value={connectedParticipants > 0 ? `${connectedParticipants} connected` : ""} tone="accent" />
          <span className={`circle-room-status ${activeCircle.voiceSession?.active ? "open" : "paused"}`}>
            {activeCircle.voiceSession?.active ? "Audio Open" : "Audio Locked"}
          </span>
        </div>
      </div>

      <div className="circle-voice-grid">
        <div className="circle-voice-main">
          <div className="circle-voice-stage">
            <div className="circle-voice-stage-top">
              <div>
                <div className="sp-label">Floor Timer</div>
                <div className="circle-voice-stage-time">{floorElapsedLabel}</div>
              </div>
              <div className="circle-card-statuses">
                <NotificationBadge value={connectedParticipants > 0 ? `${connectedParticipants} connected` : ""} tone="accent" />
                <NotificationBadge value={liveMicCount > 0 ? `${liveMicCount} live mics` : ""} tone="success" />
              </div>
            </div>

            <div className="circle-voice-stage-body">
              <div
                className={`circle-voice-radar ${audioJoined ? "joined" : ""} ${micMuted ? "muted" : ""}`}
                style={{ "--voice-level": String(clampUnit(roomMotionLevel)) }}
              >
                <span className="circle-voice-radar-ring circle-voice-radar-ring-one" />
                <span className="circle-voice-radar-ring circle-voice-radar-ring-two" />
                <span className="circle-voice-radar-core">
                  {micMuted ? <Icon.Mic active={false} /> : <Icon.Wave />}
                </span>
                <div className="circle-voice-spectrum" aria-hidden="true">
                  {Array.from({ length: 14 }).map((_, index) => {
                    const barStrength = clampUnit(roomMotionLevel * 1.35 - (index * 0.06));

                    return (
                      <span
                        key={`room-bar-${index}`}
                        className={`circle-voice-spectrum-bar ${barStrength > 0.12 ? "active" : ""}`}
                        style={{ "--voice-bar-scale": String(0.24 + barStrength * 1.18) }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="circle-voice-stage-copy">
                <strong>
                  {featuredParticipant?.level > 0.16
                    ? `${featuredParticipant.participant.name} is carrying the audio right now.`
                    : audioJoined
                      ? (micMuted ? "You are listening with your mic muted." : "You are in the live room and your mic is ready.")
                      : activeCircle.voiceSession?.active
                        ? "The audio room is open and waiting for people to join."
                        : "The audio room opens when a moderator starts the live floor."}
                </strong>
                <p>
                  {floorStartedAt
                    ? `Floor started ${formatRelativeTime(floorStartedAt)} and has been open for ${floorElapsedLabel}.`
                    : "The timer appears here when the live floor starts."}
                  {" "}
                  {currentMember
                    ? "Mute state now syncs across the room."
                    : "Join this circle first so the audio room can recognize you."}
                </p>
                <div className="circle-voice-stage-meta">
                  <div className="circle-voice-stage-chip">
                    <span className="sp-label">Your mic</span>
                    <strong>{audioJoined ? (micMuted ? "Muted" : "Live") : "Offline"}</strong>
                  </div>
                  <div className="circle-voice-stage-chip">
                    <span className="sp-label">Room motion</span>
                    <strong>{roomMotionLevel > 0.18 ? "Active" : "Calm"}</strong>
                  </div>
                  <div className="circle-voice-stage-chip">
                    <span className="sp-label">Since start</span>
                    <strong>{floorElapsedLabel}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="circle-voice-note">
            <span className="circle-voice-note-icon"><Icon.Wave /></span>
            <div>
              <strong>
                {audioJoined
                  ? (micMuted ? "Your mic is muted but you are still inside the live room." : "Your mic is open and other people can hear you in real time.")
                  : activeCircle.voiceSession?.active
                    ? "Join the live room when you are ready to listen and speak."
                    : "The room stays chat-first until a moderator starts the floor."}
              </strong>
              <p>
                {currentMember
                  ? "The center shows room activity, and each row shows who is connected right now."
                  : "Join this circle first, then the audio room can connect you."}
              </p>
            </div>
          </div>

          <div className="circle-voice-controls">
            {!activeCircle.voiceSession?.active && canModerateRoom && (
              <button className="sp-btn sp-btn-primary" type="button" onClick={() => onToggleVoiceSession(activeCircle.id)}>
                <Icon.Mic active />
                Start Audio Room
              </button>
            )}

            {activeCircle.voiceSession?.active && !audioJoined && (
              <button
                className="sp-btn sp-btn-primary"
                type="button"
                disabled={audioBusy || !currentMember}
                onClick={handleJoinAudio}
              >
                <Icon.Mic active />
                {audioBusy ? "Joining Audio..." : "Join Audio Room"}
              </button>
            )}

            {audioJoined && (
              <>
                <button className={`sp-btn ${micMuted ? "sp-btn-ghost" : "sp-btn-primary"}`} type="button" onClick={handleToggleMute}>
                  <Icon.Mic active={!micMuted} />
                  {micMuted ? "Unmute Mic" : "Mute Mic"}
                </button>
                <button className="sp-btn sp-btn-ghost" type="button" onClick={() => void leaveAudioRoom()}>
                  <Icon.Close />
                  Leave Audio
                </button>
              </>
            )}

            {activeCircle.voiceSession?.active && canModerateRoom && (
              <button className="sp-btn sp-btn-ghost" type="button" onClick={() => onToggleVoiceSession(activeCircle.id)}>
                <Icon.Wave />
                End Audio Room
              </button>
            )}
          </div>

          {voiceStatus ? <div className="circle-voice-feedback">{voiceStatus}</div> : null}
          {voiceError ? <div className="circle-voice-feedback error">{voiceError}</div> : null}
        </div>

        <div className="circle-voice-roster">
          <div className="sp-label">Connected right now</div>
          {voiceParticipants.length > 0 ? voiceParticipants.map(participant => {
            const isCurrentParticipant = participant.memberId === currentUserId;
            const member = getCircleMember(activeCircle, participant.memberId);
            const mood = member ? getMoodMeta(member.mood) : null;
            const avatarTone = member?.color || "var(--accent2)";
            const participantLevel = participant.memberId === currentUserId
              ? localAudioLevel
              : (remoteAudioLevels[participant.memberId] || 0);
            const participantDuration = formatElapsedDuration(participant.joinedAt || floorStartedAt, clockNowMs);
            const participantRoleLabel = participant.isModerator
              ? "Moderator"
              : participant.onFloor
                ? "On the floor"
                : "In the room";

            return (
              <div
                key={participant.memberId}
                className={`circle-voice-member ${participant.muted ? "muted" : ""} ${participantLevel > 0.14 ? "speaking" : ""}`}
              >
                <div className="circle-voice-member-main">
                  <span className="circle-voice-avatar" style={{ background: avatarTone }}>
                    {participant.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="circle-voice-member-copy">
                    <strong>{participant.name}</strong>
                    <span>
                      {participantRoleLabel}
                      {mood ? ` · ${mood.icon} ${mood.label}` : ""}
                    </span>
                    <span className="circle-voice-member-time">
                      Connected for {participantDuration}
                    </span>
                  </div>
                </div>
                <div className="circle-voice-member-status">
                  <span className={`circle-voice-chip ${participant.muted ? "muted" : "live"}`}>
                    {participant.muted ? "Muted" : "Mic On"}
                  </span>
                  {isCurrentParticipant ? <span className="circle-voice-chip you">You</span> : null}
                </div>
                <div className="circle-voice-member-meter" aria-hidden="true">
                  {Array.from({ length: 12 }).map((_, index) => {
                    const barStrength = clampUnit(participantLevel * 1.45 - (index * 0.075));

                    return (
                      <span
                        key={`${participant.memberId}-meter-${index}`}
                        className={`circle-voice-member-bar ${barStrength > 0.1 ? "active" : ""}`}
                        style={{ "--voice-bar-scale": String(0.22 + barStrength * 1.12) }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          }) : (
            <div className="circle-empty-note">
              No one is connected to audio yet. {connectedListeners.length === 0 ? "When members join, they will show up here instantly." : ""}
            </div>
          )}
        </div>
      </div>

      {Object.entries(remoteStreams).map(([memberId, stream]) => (
        <audio
          key={memberId}
          autoPlay
          playsInline
          ref={node => bindRemoteAudioRef(memberId, node)}
          data-stream-id={stream.id}
        />
      ))}
    </div>
  );
}

function CirclesView({
  circles,
  activeCircleId,
  circlesLoading,
  currentMood,
  directoryTab,
  isGuest,
  isSuperAdmin,
  onDirectoryTabChange,
  onBackToDirectory,
  onCreateCircle,
  onDeleteCircle,
  onSetCircleMemberRole,
  onJoinCircle,
  onMoveToAudience,
  onOpenCircle,
  onPostAnnouncement,
  onRemoveCircleMember,
  onRequireAccount,
  onSendCircleMessage,
  onToggleHand,
  onToggleRequests,
  onToggleVoiceSession,
  onInviteSpeaker,
  onMarkCircleRead,
  sessionProfile,
}) {
  const [chatDraft, setChatDraft] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [circleDraft, setCircleDraft] = useState({
    topic: "",
    description: "",
    schedule: "",
    icon: "🫶",
  });
  const [roomTab, setRoomTab] = useState("overview");
  const [activeVoiceSnapshot, setActiveVoiceSnapshot] = useState({
    circleId: "",
    active: false,
    startedAt: "",
    participants: [],
    updatedAt: "",
  });
  const circleChatPreviewRef = useRef(null);
  const circleChatFeedRef = useRef(null);
  const circleChatComposerRef = useRef(null);
  const maxCircleComposerHeight = 160;

  const resizeCircleComposer = useCallback(() => {
    const textarea = circleChatComposerRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, maxCircleComposerHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxCircleComposerHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    setChatDraft("");
    setAnnouncementDraft("");
    setRoomTab("overview");
    setActiveVoiceSnapshot({
      circleId: activeCircleId || "",
      active: false,
      startedAt: "",
      participants: [],
      updatedAt: "",
    });
  }, [activeCircleId]);

  const currentUserId = createCurrentMemberId(sessionProfile);
  const activeCircle = circles.find(circle => circle.id === activeCircleId) || null;
  const joinedCircles = circles.filter(circle => circle.members.some(member => member.id === currentUserId));
  const totalUnread = joinedCircles.reduce((sum, circle) => sum + getCircleUnreadCount(circle, currentUserId), 0);
  const liveJoinedCount = joinedCircles.filter(circle => isCircleLive(circle)).length;

  useEffect(() => {
    resizeCircleComposer();
  }, [activeCircleId, chatDraft, resizeCircleComposer, roomTab]);

  useEffect(() => {
    if (!activeCircle) {
      return;
    }

    const feedNode = roomTab === "chat" ? circleChatFeedRef.current : circleChatPreviewRef.current;

    if (!feedNode) {
      return;
    }

    feedNode.scrollTo({
      top: feedNode.scrollHeight,
      behavior: roomTab === "chat" ? "smooth" : "auto",
    });
  }, [activeCircle, roomTab]);

  useEffect(() => {
    if (!activeCircle || !onMarkCircleRead) {
      return undefined;
    }

    const currentMember = getCircleMember(activeCircle, currentUserId);
    const unreadCount = getCircleUnreadCount(activeCircle, currentUserId);

    if (!currentMember || unreadCount === 0) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void onMarkCircleRead(activeCircle.id);
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeCircle, currentUserId, onMarkCircleRead]);

  const submitCircleMessage = useCallback(() => {
    if (!activeCircle?.id || !chatDraft.trim()) {
      return;
    }

    void onSendCircleMessage(activeCircle.id, chatDraft);
    setChatDraft("");
  }, [activeCircle?.id, chatDraft, onSendCircleMessage]);

  const renderCircleList = (items, options = {}) => {
    if (items.length === 0) {
      return <div className="circle-empty-note">{options.emptyMessage}</div>;
    }

    return (
      <div className="circle-directory-grid">
        {items.map(circle => (
          <CirclePreviewCard
            key={circle.id}
            circle={circle}
            currentUserId={currentUserId}
            onDeleteCircle={onDeleteCircle}
            onJoinCircle={onJoinCircle}
            onOpenCircle={onOpenCircle}
            showManage={options.showManage}
          />
        ))}
      </div>
    );
  };

  if (isGuest) {
    return (
      <AccessGateView
        title="Support circles open after sign-in."
        body="Anonymous mode keeps the first step light. Choose a sign-in option when you want saved circles and deeper participation."
        onRequireAccount={() => onRequireAccount("circles")}
      />
    );
  }

  if (activeCircle) {
    const currentMember = getCircleMember(activeCircle, currentUserId);
    const moderators = getCircleModerators(activeCircle);
    const queuedMembers = activeCircle.requestQueue
      .map(memberId => getCircleMember(activeCircle, memberId))
      .filter(Boolean);
    const latestAnnouncement = activeCircle.announcements[0] || null;
    const latestMessage = getLatestCircleMessage(activeCircle);
    const isCurrentUserSpeaker = activeCircle.speakers.includes(currentUserId);
    const isCurrentUserQueued = activeCircle.requestQueue.includes(currentUserId);
    const currentUnreadCount = getCircleUnreadCount(activeCircle, currentUserId);
    const canModerateRoom = isSuperAdmin || currentMember?.role === "moderator";
    const canCurrentUserRequestFloor = Boolean(currentMember && currentMember.role !== "moderator" && !isCurrentUserSpeaker);
    const liveVoiceParticipants = activeVoiceSnapshot.circleId === activeCircle.id && Array.isArray(activeVoiceSnapshot.participants)
      ? activeVoiceSnapshot.participants
      : EMPTY_ITEMS;
    const liveParticipantIds = new Set(
      liveVoiceParticipants
        .map(participant => participant.memberId)
        .filter(Boolean),
    );
    const liveSpeakerMembers = liveVoiceParticipants
      .filter(participant => participant.onFloor || participant.isModerator)
      .map(participant => getCircleMember(activeCircle, participant.memberId))
      .filter(Boolean);
    const liveListenerMembers = liveVoiceParticipants
      .filter(participant => !participant.onFloor && !participant.isModerator)
      .map(participant => getCircleMember(activeCircle, participant.memberId))
      .filter(Boolean);
    const connectedMemberCount = liveParticipantIds.size;
    const connectedQueuedMembers = queuedMembers.filter(member => liveParticipantIds.has(member.id));
    const connectedModeratorCount = liveVoiceParticipants.filter(participant => participant.isModerator).length;
    const isCurrentUserConnectedToLiveRoom = liveParticipantIds.has(currentUserId);
    const activeVoiceRoom = Boolean(activeCircle.voiceSession?.active || activeVoiceSnapshot.active);
    const roomTabs = [
      { id: "overview", label: "Overview" },
      { id: "stage", label: "Voice Floor", badge: isCircleLive(activeCircle) ? "Live" : "", badgeTone: "success" },
      { id: "chat", label: "Chat", badge: currentUnreadCount > 0 ? String(currentUnreadCount) : "", badgeTone: "accent" },
      { id: "members", label: "Members", badge: String(activeCircle.members.length) },
      ...(canModerateRoom ? [{ id: "admin", label: "Moderation" }] : []),
    ];

    const roomActionButtons = (
      <div className="circle-room-actions">
        {!currentMember && (
          <button className="sp-btn sp-btn-primary" type="button" onClick={() => onJoinCircle(activeCircle.id)}>
            Join Circle
            <Icon.Forward />
          </button>
        )}

        {canCurrentUserRequestFloor && (
          <button
            className={`sp-btn ${isCurrentUserQueued ? "sp-btn-ghost" : "sp-btn-primary"}`}
            type="button"
            onClick={() => onToggleHand(activeCircle.id)}
            disabled={!activeCircle.voiceSession?.active || !isCurrentUserConnectedToLiveRoom || (!activeCircle.allowRequests && !isCurrentUserQueued)}
          >
            {isCurrentUserQueued ? "Lower Hand" : "Raise Hand"}
          </button>
        )}

        {currentMember && isCurrentUserSpeaker && (
          <button className="sp-btn sp-btn-ghost" type="button" onClick={() => onMoveToAudience(activeCircle.id, currentUserId)}>
            Move To Audience
          </button>
        )}

        {canModerateRoom && (
          <button
            className={`sp-btn ${activeCircle.voiceSession?.active ? "sp-btn-ghost" : "sp-btn-primary"}`}
            type="button"
            onClick={() => onToggleVoiceSession(activeCircle.id)}
          >
            {activeCircle.voiceSession?.active ? "End Voice Floor" : "Start Voice Floor"}
          </button>
        )}

        {canModerateRoom && (
          <button className="sp-btn sp-btn-ghost" type="button" onClick={() => onToggleRequests(activeCircle.id)}>
            {activeCircle.allowRequests ? "Pause Requests" : "Resume Requests"}
          </button>
        )}

        <button className="sp-btn sp-btn-ghost" type="button" onClick={() => setRoomTab("chat")}>
          Open Chat
        </button>
      </div>
    );

    return (
      <div className="sp-panel">
        <div className="circle-room-hero">
          <button className="sp-btn sp-btn-ghost" type="button" onClick={onBackToDirectory}>
            <Icon.Back />
            All Circles
          </button>
          <div className="section-pill">Circle Space</div>
          <div className="sp-h1">{activeCircle.icon} {activeCircle.topic}</div>
          <div className="sp-sub">{activeCircle.description}</div>
          <div className="circle-room-glance">
            <div className="assistant-glance-pill">{activeCircle.schedule}</div>
            <div className="assistant-glance-pill">{activeCircle.members.length} joined</div>
            <div className="assistant-glance-pill">{moderators.length} moderators</div>
            <div className="assistant-glance-pill">{activeCircle.allowRequests ? "Raise hand on" : "Raise hand paused"}</div>
            {isCircleLive(activeCircle) ? <div className="assistant-glance-pill">Live voice</div> : null}
          </div>
        </div>

        <div className="circle-room-summary-strip">
          <div className="sp-card circle-room-summary-card">
            <span className="sp-label">Live room</span>
            <strong>{activeVoiceRoom ? "Open" : "Closed"}</strong>
            <p>{connectedMemberCount > 0 ? `${connectedMemberCount} connected right now` : "No one connected yet"}</p>
          </div>
          <div className="sp-card circle-room-summary-card">
            <span className="sp-label">Queue</span>
            <strong>{connectedQueuedMembers.length}</strong>
            <p>{activeCircle.allowRequests ? "Connected members can raise a hand once they join audio." : "Requests are paused for now."}</p>
          </div>
          <div className="sp-card circle-room-summary-card">
            <span className="sp-label">Chat</span>
            <strong>{currentUnreadCount}</strong>
            <p>{latestMessage ? `${latestMessage.author}: ${latestMessage.text}` : "No messages yet in this circle."}</p>
          </div>
        </div>

        <ViewTabs items={roomTabs} activeId={roomTab} onChange={setRoomTab} />

        <div className={`circle-stage-panel-shell ${roomTab === "stage" ? "" : "hidden"}`}>
          <CircleVoicePanel
            key={`${activeCircle.id}-${currentUserId}`}
            activeCircle={activeCircle}
            canModerateRoom={canModerateRoom}
            currentMember={currentMember}
            currentUserId={currentUserId}
            onRoomSnapshotChange={setActiveVoiceSnapshot}
            onToggleVoiceSession={onToggleVoiceSession}
            sessionProfile={sessionProfile}
          />
        </div>

        {roomTab === "overview" && (
          <div className="circle-room-layout">
            <div className="circle-room-sidebar">
              {latestAnnouncement ? (
                <div className="circle-announce-banner">
                  <div className="circle-announce-copy">
                    <span className="sp-label">Latest moderator note</span>
                    <strong>{latestAnnouncement.title}</strong>
                    <p>{latestAnnouncement.body}</p>
                  </div>
                  <span className="circle-announce-time">{formatRelativeTime(latestAnnouncement.createdAt)}</span>
                </div>
              ) : (
                <div className="sp-card circle-presence-card">
                  <strong>No moderator note yet</strong>
                  <p>This room has not received a fresh announcement yet, so the voice floor and chat are setting the tone for now.</p>
                </div>
              )}

              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Your presence here</div>
                <div className="circle-presence-card">
                  <strong>{currentMember ? "You are part of this circle" : "You are not in this circle yet"}</strong>
                  <p>
                    {currentMember
                      ? `You joined as ${currentMember.role === "moderator" ? "a moderator" : "a member"} and your mood is currently marked as ${getMoodMeta(currentMood).label.toLowerCase()}.`
                      : "Join the circle to chat with the group first, then enter audio when you are ready to be seen live."}
                  </p>
                </div>
              </div>

              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Room moderators</div>
                <div className="circle-member-stack">
                  {moderators.map(member => (
                    <CircleMemberRow key={member.id} member={member} badge="Moderator" />
                  ))}
                </div>
              </div>

              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Live presence</div>
                <div className="circle-presence-card">
                  <strong>{connectedMemberCount > 0 ? `${connectedMemberCount} people connected` : "No live participants yet"}</strong>
                  <p>
                    {connectedMemberCount > 0
                      ? `${connectedModeratorCount} moderator${connectedModeratorCount === 1 ? "" : "s"} and ${liveListenerMembers.length} listener${liveListenerMembers.length === 1 ? "" : "s"} are currently inside audio.`
                      : "Member status shows up here only after someone actually joins the live audio room."}
                  </p>
                </div>
              </div>
            </div>

            <div className="circle-room-main">
              <div className="circle-stage-card">
                <div className="circle-card-head">
                  <div>
                    <div className="sp-label">Room Snapshot</div>
                    <div className="sp-h2">{activeCircle.stageTopic}</div>
                    <div className="sp-sub" style={{ marginTop: 6 }}>{activeCircle.hostNote}</div>
                  </div>
                  <span className={`circle-room-status ${activeCircle.allowRequests ? "open" : "paused"}`}>
                    {activeCircle.allowRequests ? "Requests Open" : "Requests Paused"}
                  </span>
                </div>

                {roomActionButtons}

                <div className="circle-stage-grid">
                  <div className="circle-stage-column">
                    <div className="sp-label">On The Floor</div>
                    <div className="circle-member-stack">
                      {liveSpeakerMembers.length > 0 ? liveSpeakerMembers.map(member => (
                        <CircleMemberRow
                          key={member.id}
                          member={member}
                          badge={member.role === "moderator" ? "Moderator" : "Speaker"}
                        />
                      )) : <div className="circle-empty-note">No one is on the live floor yet. Members appear here only after they join audio and take the mic.</div>}
                    </div>
                  </div>

                  <div className="circle-stage-column">
                    <div className="sp-label">Raised Hands</div>
                    <div className="circle-member-stack">
                      {connectedQueuedMembers.length > 0 ? connectedQueuedMembers.map(member => (
                        <CircleMemberRow
                          key={member.id}
                          member={member}
                          badge="Waiting"
                          actions={canModerateRoom ? [{ label: "Invite", onClick: () => onInviteSpeaker(activeCircle.id, member.id) }] : []}
                        />
                      )) : <div className="circle-empty-note">The queue is quiet right now. People can raise a hand after joining the live audio room.</div>}
                    </div>
                  </div>

                  <div className="circle-stage-column">
                    <div className="sp-label">Listening Live</div>
                    <div className="circle-member-stack">
                      {liveListenerMembers.length > 0 ? liveListenerMembers.map(member => (
                        <CircleMemberRow key={member.id} member={member} badge={member.id === currentUserId ? "You" : "Live"} />
                      )) : <div className="circle-empty-note">No listener status shows until someone actually joins the live audio room.</div>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="circle-chat-card circle-chat-preview-card">
                <div className="circle-card-head">
                  <div>
                    <div className="sp-label">Group Thread Preview</div>
                    <div className="sp-h2">What the circle is saying</div>
                  </div>
                  <button className="sp-btn sp-btn-ghost" type="button" onClick={() => setRoomTab("chat")}>
                    Full Chat
                  </button>
                </div>
                <div ref={circleChatPreviewRef} className="circle-chat-feed circle-chat-feed-preview">
                  {activeCircle.chat.slice(-4).map(message => (
                    <CircleMessageRow key={message.id} message={message} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {roomTab === "stage" && (
          <div className="circle-stage-card">
            <div className="circle-card-head">
              <div>
                <div className="sp-label">Voice Floor</div>
                <div className="sp-h2">{activeCircle.stageTopic}</div>
                <div className="sp-sub" style={{ marginTop: 6 }}>{activeCircle.hostNote}</div>
              </div>
              <span className={`circle-room-status ${activeCircle.allowRequests ? "open" : "paused"}`}>
                {activeCircle.allowRequests ? "Requests Open" : "Requests Paused"}
              </span>
            </div>

            {roomActionButtons}

            <div className="circle-stage-grid">
              <div className="circle-stage-column">
                <div className="sp-label">On The Floor</div>
                <div className="circle-member-stack">
                  {liveSpeakerMembers.length > 0 ? liveSpeakerMembers.map(member => (
                    <CircleMemberRow
                      key={member.id}
                      member={member}
                      badge={member.role === "moderator" ? "Moderator" : "Speaker"}
                      actions={canModerateRoom && member.role !== "moderator"
                        ? [{ label: "Audience", onClick: () => onMoveToAudience(activeCircle.id, member.id) }]
                        : []}
                    />
                  )) : <div className="circle-empty-note">No one is on the floor yet. Moderators and speakers appear here only after joining audio.</div>}
                </div>
              </div>

              <div className="circle-stage-column">
                <div className="sp-label">Raised Hands</div>
                <div className="circle-member-stack">
                  {connectedQueuedMembers.length > 0 ? connectedQueuedMembers.map(member => (
                    <CircleMemberRow
                      key={member.id}
                      member={member}
                      badge="Waiting"
                      actions={canModerateRoom ? [{ label: "Invite", onClick: () => onInviteSpeaker(activeCircle.id, member.id) }] : []}
                    />
                  )) : <div className="circle-empty-note">The queue is quiet right now. Members can raise a hand once they are inside the live room.</div>}
                </div>
              </div>

              <div className="circle-stage-column">
                <div className="sp-label">Listening Live</div>
                <div className="circle-member-stack">
                  {liveListenerMembers.length > 0 ? liveListenerMembers.map(member => (
                    <CircleMemberRow key={member.id} member={member} badge={member.id === currentUserId ? "You" : "Live"} />
                  )) : <div className="circle-empty-note">No live listeners yet. Circle members who have not joined audio stay in the People tab instead.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {roomTab === "chat" && (
          <div className="circle-chat-layout">
            <div className="circle-chat-side">
              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Group details</div>
                <div className="circle-presence-card">
                  <strong>{activeCircle.icon} {activeCircle.topic}</strong>
                  <p>{activeCircle.members.length} members · {moderators.length} moderators · {activeCircle.schedule}</p>
                </div>
              </div>

              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Live status</div>
                <div className="circle-presence-card">
                  <strong>{activeVoiceRoom ? "Voice floor is active" : "Voice floor is closed"}</strong>
                  <p>{activeVoiceRoom ? `${connectedMemberCount} connected right now. Member status turns live only after they join audio.` : "Moderators can start the next live floor when the circle is ready."}</p>
                </div>
              </div>

              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Moderators</div>
                <div className="circle-member-stack">
                  {moderators.map(member => (
                    <CircleMemberRow key={member.id} member={member} badge="Moderator" />
                  ))}
                </div>
              </div>
            </div>

            <div className="circle-chat-card circle-chat-card-expanded">
              <div className="circle-card-head">
                <div>
                  <div className="sp-label">Circle Chat</div>
                  <div className="sp-h2">Talk like a full group thread</div>
                  <div className="circle-chat-group-line">{activeCircle.icon} {activeCircle.topic} · {activeCircle.members.length} members</div>
                </div>
                <span className="circle-chat-hint">Names, live-room status, and fresh messages stay visible so the conversation feels grounded and easy to follow.</span>
              </div>

              <div ref={circleChatFeedRef} className="circle-chat-feed circle-chat-feed-expanded">
                {activeCircle.chat.map(message => (
                  <CircleMessageRow key={message.id} message={message} />
                ))}
              </div>

              {currentMember ? (
                <div className="circle-chat-composer">
                  <textarea
                    ref={circleChatComposerRef}
                    className="chat-input chat-input-multiline"
                    placeholder="Write into the circle chat..."
                    value={chatDraft}
                    rows={1}
                    onChange={event => setChatDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitCircleMessage();
                      }
                    }}
                  />
                  <button
                    className="chat-send-btn"
                    type="button"
                    disabled={!chatDraft.trim()}
                    onClick={submitCircleMessage}
                  >
                    <Icon.Send />
                  </button>
                </div>
              ) : (
                <div className="circle-empty-note">Join the circle first so your messages and raised hands are tied to your identity in this room.</div>
              )}
            </div>
          </div>
        )}

        {roomTab === "members" && (
          <div className="circle-room-layout">
            <div className="circle-room-sidebar">
              <div className="sp-card">
                <div className="sp-label">How this room works</div>
                <div className="circle-guideline-list">
                  {activeCircle.guidelines.map(line => (
                    <div key={line} className="circle-guideline-item">
                      <span className="entry-preview-line-dot" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Moderators</div>
                <div className="circle-member-stack">
                  {moderators.map(member => (
                    <CircleMemberRow key={member.id} member={member} badge="Moderator" />
                  ))}
                </div>
              </div>
            </div>

            <div className="sp-card circle-member-directory-card">
              <div className="sp-label">People in this room</div>
              <div className="circle-member-stack">
                {activeCircle.members.map(member => (
                  <CircleMemberRow
                    key={member.id}
                    member={member}
                    badge={member.role === "moderator" ? "Moderator" : member.id === currentUserId ? "You" : "Member"}
                    actions={[
                      isSuperAdmin && member.id !== currentUserId
                        ? {
                            label: member.role === "moderator" ? "Make Member" : "Make Moderator",
                            onClick: () => onSetCircleMemberRole(
                              activeCircle.id,
                              member.id,
                              member.role === "moderator" ? "member" : "moderator",
                            ),
                          }
                        : null,
                      canModerateRoom && member.id !== currentUserId
                        ? { label: "Remove", onClick: () => onRemoveCircleMember(activeCircle.id, member.id), tone: "danger" }
                        : null,
                    ].filter(Boolean)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {roomTab === "admin" && canModerateRoom && (
          <div className="circle-room-layout">
            <div className="circle-room-sidebar">
              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Moderation summary</div>
                <div className="circle-presence-card">
                  <strong>{activeVoiceRoom ? "Voice floor is active" : "Voice floor is closed"}</strong>
                  <p>{activeCircle.allowRequests ? "Hands are open, but only connected audio participants can enter the queue." : "Hands are paused until a moderator reopens the queue."}</p>
                </div>
              </div>

              <div className="sp-card circle-room-side-card">
                <div className="sp-label">Moderator roster</div>
                <div className="circle-member-stack">
                  {moderators.map(member => (
                    <CircleMemberRow
                      key={member.id}
                      member={member}
                      badge={member.id === currentUserId ? "You" : "Moderator"}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="circle-admin-card">
              <div className="circle-card-head">
                <div>
                  <div className="sp-label">{isSuperAdmin ? "Admin + Moderator" : "Moderator"}</div>
                  <div className="sp-h2">Moderation controls</div>
                </div>
                <span className="circle-room-status open">{isSuperAdmin ? "Admin" : "Moderator"}</span>
              </div>

              <div className="circle-admin-toolbar">
                <button
                  className={`sp-btn ${activeCircle.voiceSession?.active ? "sp-btn-ghost" : "sp-btn-primary"}`}
                  type="button"
                  onClick={() => onToggleVoiceSession(activeCircle.id)}
                >
                  {activeCircle.voiceSession?.active ? "End Voice Floor" : "Start Voice Floor"}
                </button>
                <button className="sp-btn sp-btn-ghost" type="button" onClick={() => onToggleRequests(activeCircle.id)}>
                  {activeCircle.allowRequests ? "Pause Requests" : "Resume Requests"}
                </button>
              </div>

              <textarea
                className="safe-editor"
                rows={3}
                placeholder="Share an announcement with this circle..."
                value={announcementDraft}
                onChange={event => setAnnouncementDraft(event.target.value)}
              />
              <div className="sp-input-row">
                <button
                  className="sp-btn sp-btn-primary"
                  type="button"
                  disabled={!announcementDraft.trim()}
                  onClick={() => {
                    onPostAnnouncement(activeCircle.id, announcementDraft);
                    setAnnouncementDraft("");
                  }}
                >
                  Post Announcement
                </button>
                {isSuperAdmin && (
                  <button className="sp-btn sp-btn-ghost circle-danger-btn" type="button" onClick={() => onDeleteCircle(activeCircle.id)}>
                    Delete Circle
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const directoryTabs = [
    { id: "discover", label: "Discover", badge: String(circles.length) },
    { id: "joined", label: "Joined", badge: joinedCircles.length > 0 ? String(joinedCircles.length) : "" },
    { id: "activity", label: "Activity", badge: totalUnread > 0 ? String(totalUnread) : liveJoinedCount > 0 ? `${liveJoinedCount} live` : "", badgeTone: totalUnread > 0 ? "accent" : "success" },
    ...(isSuperAdmin ? [{ id: "manage", label: "Manage" }] : []),
  ];
  const activityCircles = sortCirclesByActivity(joinedCircles.length > 0 ? joinedCircles : circles, currentUserId);

  return (
    <div className="sp-panel">
      <div style={{ marginBottom: 22 }}>
        <div className="sp-h1">Support Circles</div>
        <div className="sp-sub">Join a circle, move into the live room, raise your hand when you need the floor, and keep chatting together between turns without the page turning into one long stack.</div>
      </div>

      <div className="circle-directory-summary">
        {[
          ["Open circles", String(circles.length)],
          ["Joined", String(joinedCircles.length)],
          ["Unread chat", String(totalUnread)],
          ["Live rooms", String(liveJoinedCount)],
        ].map(([label, value]) => (
          <div key={label} className="sp-card circle-summary-card">
            <span className="sp-label">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <ViewTabs items={directoryTabs} activeId={directoryTab} onChange={onDirectoryTabChange} />

      {circlesLoading && circles.length === 0 ? (
        <div className="circle-empty-note">Loading circles from the shared data store…</div>
      ) : null}

      {directoryTab === "discover" && renderCircleList(circles, {
        emptyMessage: "No circles are available yet. A moderator can create one from the manage tab.",
      })}

      {directoryTab === "joined" && (
        <div className="circle-room-stack">
          {joinedCircles.length > 0 && (
            <div className="sp-card circle-joined-strip">
              <div className="sp-label">Your joined spaces</div>
              <div className="circle-joined-list">
                {joinedCircles.map(circle => (
                  <button key={circle.id} className="circle-room-pill" type="button" onClick={() => onOpenCircle(circle.id)}>
                    <span>{circle.icon}</span>
                    {circle.topic}
                    <NotificationBadge value={getCircleUnreadCount(circle, currentUserId) > 0 ? String(getCircleUnreadCount(circle, currentUserId)) : ""} tone="accent" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {renderCircleList(joinedCircles, {
            emptyMessage: "Join a circle first, then it will appear here so you can jump back into the room quickly.",
          })}
        </div>
      )}

      {directoryTab === "activity" && (
        <div className="circle-room-stack">
          <div className="sp-card circle-activity-summary">
            <div className="circle-card-head">
              <div>
                <div className="sp-label">Room activity</div>
                <div className="sp-h2">Unread chats and live rooms</div>
              </div>
              <div className="circle-card-statuses">
                <NotificationBadge value={totalUnread > 0 ? String(totalUnread) : ""} tone="accent" />
                <NotificationBadge value={liveJoinedCount > 0 ? `${liveJoinedCount} live` : ""} tone="success" />
              </div>
            </div>
            <div className="sp-sub">Unread group chat and active voice rooms float to the top here so you can jump back into what needs your attention.</div>
          </div>
          {renderCircleList(activityCircles, {
            emptyMessage: "No live room or unread activity is waiting for you right now.",
          })}
        </div>
      )}

      {directoryTab === "manage" && isSuperAdmin && (
        <div className="circle-manage-stack">
          <div className="circle-manage-grid">
            <div className="sp-card circle-create-card">
              <div className="circle-card-head">
                <div>
                  <div className="sp-label">Super Admin Console</div>
                  <div className="sp-h2">Create and manage circles</div>
                </div>
                <span className="circle-room-status open">Admin Tools</span>
              </div>
              <div className="circle-form-grid">
                <label className="entry-form-field">
                  <span>Circle icon</span>
                  <input
                    type="text"
                    maxLength={4}
                    value={circleDraft.icon}
                    onChange={event => setCircleDraft(currentDraft => ({ ...currentDraft, icon: event.target.value }))}
                  />
                </label>
                <label className="entry-form-field">
                  <span>Schedule</span>
                  <input
                    type="text"
                    placeholder="Mondays · 7:00 PM"
                    value={circleDraft.schedule}
                    onChange={event => setCircleDraft(currentDraft => ({ ...currentDraft, schedule: event.target.value }))}
                  />
                </label>
              </div>
              <label className="entry-form-field">
                <span>Circle topic</span>
                <input
                  type="text"
                  placeholder="Grief, burnout, study pressure..."
                  value={circleDraft.topic}
                  onChange={event => setCircleDraft(currentDraft => ({ ...currentDraft, topic: event.target.value }))}
                />
              </label>
              <label className="entry-form-field">
                <span>Description</span>
                <textarea
                  className="safe-editor"
                  rows={3}
                  placeholder="Describe what this circle is for and how people can use it."
                  value={circleDraft.description}
                  onChange={event => setCircleDraft(currentDraft => ({ ...currentDraft, description: event.target.value }))}
                />
              </label>
              <div className="sp-input-row">
                <button
                  className="sp-btn sp-btn-primary"
                  type="button"
                  disabled={!circleDraft.topic.trim() || !circleDraft.description.trim() || !circleDraft.schedule.trim()}
                  onClick={() => {
                    onCreateCircle(circleDraft);
                    setCircleDraft({ topic: "", description: "", schedule: "", icon: "🫶" });
                  }}
                >
                  Create Circle
                </button>
              </div>
            </div>

            <div className="sp-card circle-manage-note-card">
              <div className="sp-label">How this flow works now</div>
              <div className="circle-guideline-list">
                {[
                  "Admins create circles and shape the room structure.",
                  "People join the circles they need without waiting for manual approval.",
                  "Moderators can start or end the live voice floor, invite speakers, and keep the room calm.",
                  "Unread chat and live-room badges surface across circles, profile, and the desktop side rail.",
                ].map(line => (
                  <div key={line} className="circle-guideline-item">
                    <span className="entry-preview-line-dot" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {renderCircleList(circles, {
            showManage: true,
            emptyMessage: "No circles are available to manage yet.",
          })}
        </div>
      )}
    </div>
  );
}

function ProfileView({
  currentUserId,
  currentMood,
  circleUnreadCount,
  entryMethod,
  isSuperAdmin,
  joinedCircles,
  liveCircleCount,
  loggingOut,
  onLogout,
  onMoodChange,
  onOpenCircle,
  privacyState,
  onSubmitFeedback,
  onPrivacyToggle,
  username,
}) {
  const controls = [
    ["Auto-delete posts after 7 days", "autoDelete"],
    ["Anonymous session rotation", "rotation"],
    ["Hide from search", "hideSearch"],
  ];
  const mood = getMoodMeta(currentMood);
  const [feedbackCategory, setFeedbackCategory] = useState("complaint");
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState("");

  return (
    <div className="sp-panel">
      <div style={{ marginBottom: 22 }}>
        <div className="sp-h1">Your Space</div>
        <div className="sp-sub">Your identity, mood, joined circles, and session controls all stay together here.</div>
      </div>
      <div className="profile-stack">
        <div className="profile-hero-grid">
          <div className="sp-card profile-identity-card">
            <div className="profile-identity-head">
              <div className="profile-avatar"><Icon.Leaf /></div>
              <div>
                <div className="sp-h2">{username}</div>
                <div className="sp-sub" style={{ marginTop: 2 }}>
                  {isSuperAdmin ? "Super admin · manages circles and room announcements" : "Signed-in identity · protected and quiet"}
                </div>
              </div>
            </div>
            <div className="profile-method-pill">
              <Icon.Shield />
              <span>{getSessionMethodLabel(entryMethod)}</span>
            </div>
            <div className="sp-label">Your state right now</div>
            {[["Today's mood", `${mood.icon} ${mood.label}`],["Circles joined", String(joinedCircles.length)],["Room role", isSuperAdmin ? "Super admin" : "Member"]].map(([label, val]) => (
              <div key={label} className="stat-row">
                <span className="stat-label"><Icon.Forward /> {label}</span>
                <span className="stat-val">{val}</span>
              </div>
            ))}
          </div>

          <div className="sp-card profile-summary-card">
            <div className="sp-label">Circle activity</div>
            <div className="profile-summary-grid">
              {[
                ["Joined spaces", String(joinedCircles.length)],
                ["Unread chats", String(circleUnreadCount)],
                ["Live rooms", String(liveCircleCount)],
                ["Feedback", "Always open"],
              ].map(([label, value]) => (
                <div key={label} className="profile-summary-tile">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="sp-sub">This page now keeps more breathing room between sections while still surfacing the circle updates that matter most.</div>
          </div>
        </div>

        <div className="profile-grid">
          <div className="sp-card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <Icon.Heart />
            <div className="sp-label" style={{ marginBottom: 0 }}>Today&apos;s Mood</div>
          </div>
          <div className="mood-grid mood-grid-expanded">
            {EMOTIONS.map(emotion => (
              <button
                key={emotion.id}
                className={`mood-chip ${currentMood === emotion.id ? "active" : ""}`}
                type="button"
                onClick={() => onMoodChange(emotion.id)}
              >
                <span>{emotion.icon}</span>
                <small>{emotion.label}</small>
              </button>
            ))}
          </div>
          </div>

          <div className="sp-card profile-card-wide">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <Icon.Circles />
            <div className="sp-label" style={{ marginBottom: 0 }}>Your Circle Spaces</div>
          </div>
          {joinedCircles.length > 0 ? joinedCircles.map(circle => (
            <button key={circle.id} className="circle-link-card" type="button" onClick={() => onOpenCircle(circle.id)}>
              <span className="circle-link-icon">{circle.icon}</span>
              <span className="circle-link-copy">
                <strong>{circle.topic}</strong>
                <span>{circle.members.length} members · {circle.schedule}</span>
              </span>
              <div className="circle-card-statuses">
                <NotificationBadge value={getCircleUnreadCount(circle, currentUserId) > 0 ? String(getCircleUnreadCount(circle, currentUserId)) : ""} tone="accent" />
                <NotificationBadge live={isCircleLive(circle)} tone="success" />
              </div>
              <Icon.Forward />
            </button>
          )) : (
            <div className="circle-empty-note">Join a circle first, then it will appear here so you can jump back into the room quickly.</div>
          )}
          </div>

          <div className="sp-card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <Icon.Privacy />
            <div className="sp-label" style={{ marginBottom: 0 }}>Privacy Controls</div>
          </div>
          {controls.map(([label, key]) => (
            <div key={key} className="stat-row">
              <span className="stat-label" style={{ fontSize: 12.5 }}>{label}</span>
              <ToggleSwitch on={privacyState[key]} onToggle={() => onPrivacyToggle(key)} />
            </div>
          ))}
          </div>

          <div className="sp-card profile-card-wide">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <Icon.Shield />
            <div className="sp-label" style={{ marginBottom: 0 }}>Feedback & complaints</div>
          </div>
          <div className="feedback-form">
            <label className="entry-form-field">
              <span>Type</span>
              <select value={feedbackCategory} onChange={event => setFeedbackCategory(event.target.value)}>
                <option value="complaint">Complaint</option>
                <option value="bug">Bug</option>
                <option value="moderation">Moderation concern</option>
                <option value="praise">Good feedback</option>
              </select>
            </label>
            <label className="entry-form-field">
              <span>Subject</span>
              <input
                type="text"
                value={feedbackSubject}
                placeholder="What happened?"
                onChange={event => setFeedbackSubject(event.target.value)}
              />
            </label>
            <label className="entry-form-field">
              <span>Details</span>
              <textarea
                className="safe-editor"
                rows={3}
                value={feedbackMessage}
                placeholder="Share what went wrong, what went well, or what needs attention."
                onChange={event => setFeedbackMessage(event.target.value)}
              />
            </label>
            {feedbackNotice ? <div className="circle-empty-note">{feedbackNotice}</div> : null}
            <div className="sp-input-row">
              <button
                className="sp-btn sp-btn-primary"
                type="button"
                disabled={feedbackSubmitting || !feedbackSubject.trim() || !feedbackMessage.trim()}
                onClick={async () => {
                  setFeedbackSubmitting(true);
                  setFeedbackNotice("");

                  try {
                    await onSubmitFeedback({
                      category: feedbackCategory,
                      subject: feedbackSubject,
                      message: feedbackMessage,
                    });

                    setFeedbackNotice("Your feedback was saved and is now visible in the admin review queue.");
                    setFeedbackSubject("");
                    setFeedbackMessage("");
                    setFeedbackCategory("complaint");
                  } catch (error) {
                    setFeedbackNotice(error.message);
                  } finally {
                    setFeedbackSubmitting(false);
                  }
                }}
              >
                {feedbackSubmitting ? "Sending…" : "Send Feedback"}
              </button>
            </div>
          </div>
          </div>

          <div className="sp-card profile-session-card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <Icon.Shield />
            <div className="sp-label" style={{ marginBottom: 0 }}>Session</div>
          </div>
          <div className="sp-sub" style={{ marginBottom: 16 }}>
            Logging out will end this local anonymous session and take you back to the landing page.
          </div>
          <button className="sp-btn sp-btn-ghost profile-logout-btn" onClick={onLogout} type="button" disabled={loggingOut}>
            {loggingOut ? "Logging out..." : "Log Out"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminView({
  adminData,
  adminLoading,
  adminTab,
  circles,
  currentUserEmail,
  isSuperAdmin,
  onDeleteCircle,
  onDeleteUser,
  onOpenCircle,
  onTabChange,
  onUpdateFeedbackStatus,
}) {
  if (!isSuperAdmin) {
    return (
      <div className="sp-panel">
        <div className="sp-card access-gate-card">
          <div className="section-pill">
            <Icon.Lock />
            Admin Only
          </div>
          <div className="sp-h1">Admin access only.</div>
          <div className="sp-sub">This dashboard is reserved for admin-approved email accounts.</div>
        </div>
      </div>
    );
  }

  const stats = adminData.stats || DEFAULT_ADMIN_DATA.stats;
  const adminTabs = [
    { id: "overview", label: "Overview" },
    { id: "circles", label: "Circles", badge: String(circles.length) },
    { id: "people", label: "People", badge: adminData.users.length > 0 ? String(adminData.users.length) : "" },
    { id: "feedback", label: "Feedback", badge: adminData.feedback.filter(item => item.status !== "resolved").length > 0 ? String(adminData.feedback.filter(item => item.status !== "resolved").length) : "" },
  ];

  return (
    <div className="sp-panel">
      <div style={{ marginBottom: 22 }}>
        <div className="sp-h1">Admin Dashboard</div>
        <div className="sp-sub">Manage circles, review member reports, and keep the support rooms healthy from one place.</div>
      </div>

      <ViewTabs items={adminTabs} activeId={adminTab} onChange={onTabChange} />

      {adminLoading ? <div className="circle-empty-note">Loading admin data from the shared store…</div> : null}

      {adminTab === "overview" && (
        <div className="admin-overview-stack">
          <div className="admin-grid">
            {[
              ["Circles", String(stats.totalCircles)],
              ["Live voice rooms", String(stats.liveCircles)],
              ["Saved users", String(stats.totalUsers)],
              ["Open reports", String(stats.openFeedback)],
            ].map(([label, value]) => (
              <div key={label} className="sp-card admin-summary-card">
                <div className="sp-label">{label}</div>
                <div className="admin-summary-value">{value}</div>
              </div>
            ))}
          </div>

          <div className="sp-card admin-workbench-card">
            <div className="circle-card-head">
              <div>
                <div className="sp-label">Admin Workbench</div>
                <div className="sp-h2">Run the whole system from one place</div>
              </div>
              <span className={`circle-room-status ${adminData.storage === "mongo" ? "open" : "paused"}`}>
                {adminData.storage === "mongo" ? "MongoDB Live" : "Memory Fallback"}
              </span>
            </div>
            <div className="admin-quick-actions">
              {[
                ["Open circles", "circles"],
                ["Review people", "people"],
                ["Open feedback", "feedback"],
              ].map(([label, tabId]) => (
                <button key={tabId} className="sp-btn sp-btn-ghost" type="button" onClick={() => onTabChange(tabId)}>
                  {label}
                </button>
              ))}
            </div>
            {adminData.warning ? <div className="circle-empty-note">{adminData.warning}</div> : null}
          </div>
        </div>
      )}

      {adminTab === "circles" && (
        <div className="circle-directory-grid">
          {circles.map(circle => (
            <div key={circle.id} className="sp-card admin-list-card">
              <div className="circle-card-head">
                <div>
                  <div className="sp-label">Circle</div>
                  <div className="sp-h2">{circle.icon} {circle.topic}</div>
                  <div className="sp-sub">{circle.members.length} members · {circle.schedule}</div>
                </div>
                <div className="circle-card-statuses">
                  <NotificationBadge live={isCircleLive(circle)} tone="success" />
                </div>
              </div>
              <div className="sp-input-row">
                <button className="sp-btn sp-btn-ghost" type="button" onClick={() => onOpenCircle(circle.id)}>
                  Open Room
                </button>
                <button className="sp-btn sp-btn-ghost circle-danger-btn" type="button" onClick={() => onDeleteCircle(circle.id)}>
                  Delete Circle
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adminTab === "people" && (
        <div className="admin-list-stack">
          {adminData.users.length > 0 ? adminData.users.map(user => (
            <div key={user.email} className="sp-card admin-list-card">
              <div className="circle-card-head">
                <div>
                  <div className="sp-h2">{user.displayName || user.username}</div>
                  <div className="sp-sub">{user.email}</div>
                </div>
                <span className={`circle-room-status ${user.role === "super-admin" ? "open" : "paused"}`}>
                  {user.role === "super-admin" ? "Admin" : "Member"}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Joined circles</span>
                <span className="stat-val">{user.joinedCircleIds?.length || 0}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Current mood</span>
                <span className="stat-val">{user.currentMood || "unknown"}</span>
              </div>
              <div className="sp-input-row">
                <button
                  className="sp-btn sp-btn-ghost circle-danger-btn"
                  type="button"
                  disabled={user.email === currentUserEmail}
                  onClick={() => onDeleteUser(user.email)}
                >
                  {user.email === currentUserEmail ? "Current Admin" : "Delete User"}
                </button>
              </div>
            </div>
          )) : (
            <div className="circle-empty-note">No saved user records are available yet.</div>
          )}
        </div>
      )}

      {adminTab === "feedback" && (
        <div className="admin-list-stack">
          {adminData.feedback.length > 0 ? adminData.feedback.map(item => (
            <div key={item.id} className="sp-card admin-list-card">
              <div className="circle-card-head">
                <div>
                  <div className="sp-label">{item.category}</div>
                  <div className="sp-h2">{item.subject}</div>
                  <div className="sp-sub">{item.createdBy?.name || "Member"} · {formatRelativeTime(item.createdAt)}</div>
                </div>
                <span className={`circle-room-status ${item.status === "resolved" ? "open" : "paused"}`}>
                  {item.status}
                </span>
              </div>
              <div className="sp-sub" style={{ marginBottom: 12 }}>{item.message}</div>
              <div className="sp-input-row">
                {["open", "reviewing", "resolved"].map(status => (
                  <button
                    key={status}
                    className={`sp-btn ${item.status === status ? "sp-btn-primary" : "sp-btn-ghost"}`}
                    type="button"
                    onClick={() => onUpdateFeedbackStatus(item.id, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          )) : (
            <div className="circle-empty-note">No complaints or good feedback have been submitted yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RIGHT PANEL ──────────────────────────────────────────────────────────────
function RightPanel({
  currentUserId,
  currentMood,
  circleUnreadCount,
  entryMethod,
  isGuest,
  isSuperAdmin,
  joinedCircles,
  liveCircleCount,
  onOpenAdminSection,
  onOpenAdminView,
  onMoodChange,
  onOpenCircle,
  onOpenCircleManage,
  onRequireAccount,
  openFeedbackCount,
  username,
}) {
  if (isGuest) {
    return (
      <div className="right-panel-content">
        <div className="side-section identity-section">
          <div className="sp-label">Anonymous Mode</div>
          <div className="identity-badge guest-identity-badge">
            <div className="identity-avatar"><Icon.Guest /></div>
            <div className="identity-copy">
              <div className="identity-name">{username}</div>
              <div className="identity-meta">Guest session · lightweight access</div>
              <div className="identity-note">
                <Icon.Shield />
                <span>No saved profile yet</span>
              </div>
            </div>
          </div>
        </div>
        <div className="side-section">
          <div className="sp-label">Available Now</div>
          {["Browse honest posts", "Use Express mode", "Talk to the AI companion"].map(item => (
            <div key={item} className="circle-mini">
              <span className="circle-mini-icon">•</span>
              <div className="circle-mini-copy">
                <div className="circle-mini-title">{item}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="side-section">
          <div className="sp-label">Unlock With Sign-In</div>
          {["Profile controls", "Support circles", "Saved session identity"].map(item => (
            <div key={item} className="circle-mini restricted-circle-mini">
              <span className="circle-mini-icon"><Icon.Lock /></span>
              <div className="circle-mini-copy">
                <div className="circle-mini-title">{item}</div>
              </div>
            </div>
          ))}
          <button className="join-btn guest-upgrade-btn" type="button" onClick={() => onRequireAccount?.("profile")}>
            <Icon.Rise />
            See Login Options
          </button>
        </div>
        <div className="safe-exit">
          Anonymous mode stays soft on purpose. Sign in only when you want circles, a saved profile, and more persistent features.
        </div>
      </div>
    );
  }

  return (
    <div className="right-panel-content">
      <div className="side-section identity-section">
        <div className="sp-label">Your Identity</div>
        <div className="identity-badge">
          <div className="identity-avatar"><Icon.Leaf /></div>
          <div className="identity-copy">
            <div className="identity-name">{username}</div>
            <div className="identity-meta">{getSessionMethodLabel(entryMethod)}</div>
            <div className="identity-note">
              <Icon.Shield />
              <span>{isSuperAdmin ? "Super admin access" : "Protected and secure"}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="side-section">
        <div className="circle-card-head">
          <div className="sp-label">Your Circles</div>
          <div className="circle-card-statuses">
            <NotificationBadge value={circleUnreadCount > 0 ? String(circleUnreadCount) : ""} tone="accent" />
            <NotificationBadge value={liveCircleCount > 0 ? `${liveCircleCount} live` : ""} tone="success" />
          </div>
        </div>
        {joinedCircles.length > 0 ? joinedCircles.slice(0, 3).map(circle => (
          <button key={circle.id} className="circle-mini circle-mini-button" type="button" onClick={() => onOpenCircle(circle.id)}>
            <span className="circle-mini-icon">{circle.icon}</span>
            <div className="circle-mini-copy">
              <div className="circle-mini-title">{circle.topic}</div>
              <div className="circle-mini-meta">
                {getLatestCircleMessage(circle)?.author
                  ? `${getLatestCircleMessage(circle).author}: ${getLatestCircleMessage(circle).text}`
                  : `${circle.members.length} members`}
              </div>
            </div>
            <div className="circle-card-statuses">
              <NotificationBadge value={getCircleUnreadCount(circle, currentUserId) > 0 ? String(getCircleUnreadCount(circle, currentUserId)) : ""} tone="accent" />
              <NotificationBadge live={isCircleLive(circle)} tone="success" />
            </div>
            <Icon.Forward />
          </button>
        )) : (
          <div className="circle-empty-note">Join a circle to get quick access to its live room, queue, and chat.</div>
        )}
      </div>
      {isSuperAdmin && (
        <div className="side-section">
          <div className="circle-card-head">
            <div className="sp-label">Admin Dock</div>
            <NotificationBadge value={openFeedbackCount > 0 ? String(openFeedbackCount) : ""} tone="accent" />
          </div>
          <div className="admin-dock-grid">
            <button className="admin-dock-action" type="button" onClick={onOpenCircleManage}>
              <span className="admin-dock-action-label">Manage circles</span>
              <span className="admin-dock-action-meta">Create rooms and assign moderators</span>
            </button>
            <button className="admin-dock-action" type="button" onClick={() => onOpenAdminSection("people")}>
              <span className="admin-dock-action-label">People</span>
              <span className="admin-dock-action-meta">Review members and remove accounts</span>
            </button>
            <button className="admin-dock-action" type="button" onClick={() => onOpenAdminSection("feedback")}>
              <span className="admin-dock-action-label">Feedback queue</span>
              <span className="admin-dock-action-meta">Handle complaints, bugs, and praise</span>
            </button>
          </div>
          <button className="join-btn guest-upgrade-btn" type="button" onClick={onOpenAdminView}>
            <Icon.Settings />
            Open Full Dashboard
          </button>
        </div>
      )}
      <div className="side-section">
        <div className="sp-label">Today&apos;s Mood</div>
        <div className="mood-grid mood-grid-expanded">
          {EMOTIONS.map(emotion => (
            <button
              key={emotion.id}
              className={`mood-chip ${currentMood === emotion.id ? "active" : ""}`}
              type="button"
              onClick={() => onMoodChange(emotion.id)}
            >
              <span>{emotion.icon}</span>
              <small>{emotion.label}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="safe-exit">
        You can come back anytime. You are not alone - this space holds whatever you need to leave here.
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function SharePass() {
  const router = useRouter();
  const [view, setView] = useState("home");
  const [posts, setPosts] = useState([]);
  const [heardToast, setHeardToast] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [privacy, setPrivacy] = useState({ autoDelete: true, rotation: false, hideSearch: true });
  const [mobileIdentityOpen, setMobileIdentityOpen] = useState(false);
  const [entryMethod, setEntryMethod] = useState("");
  const [username, setUsername] = useState("");
  const [sessionProfile, setSessionProfile] = useState(null);
  const [currentMood, setCurrentMood] = useState("hopeful");
  const [circles, setCircles] = useState([]);
  const [circlesLoading, setCirclesLoading] = useState(false);
  const [circlesDirectoryTab, setCirclesDirectoryTab] = useState("discover");
  const [activeCircleId, setActiveCircleId] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminData, setAdminData] = useState(DEFAULT_ADMIN_DATA);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminTab, setAdminTab] = useState("overview");
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const lastNonChatViewRef = useRef("home");
  const lastUserSyncSignatureRef = useRef("");
  const isGuest = isGuestEntry(entryMethod);
  const currentUserId = sessionProfile ? createCurrentMemberId(sessionProfile) : "";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedSession = getSharePassSession(window.localStorage);

    if (!savedSession?.entryMethod) {
      void router.replace("/");
      return;
    }

    const normalizedSession = saveSharePassSession(window.localStorage, savedSession) || savedSession;
    ensureSuperAdminEmails(window.localStorage, normalizedSession);

    setEntryMethod(normalizedSession.entryMethod);
    setUsername(normalizedSession.username);
    setSessionProfile(normalizedSession);
    setIsSuperAdmin(isSuperAdminSession(window.localStorage, normalizedSession));
    setSessionReady(true);
  }, [router]);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;

    setTheme(readStoredTheme(window.localStorage));
  }, [sessionReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;

    const savedPrivacy = window.localStorage.getItem(SESSION_KEYS.privacy);

    if (savedPrivacy) {
      try {
        setPrivacy(JSON.parse(savedPrivacy));
      } catch {
        window.localStorage.removeItem(SESSION_KEYS.privacy);
      }
    }
  }, [sessionReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;

    const savedMood = window.localStorage.getItem(SESSION_KEYS.mood);

    if (EMOTIONS.some(emotion => emotion.id === savedMood)) {
      setCurrentMood(savedMood);
    }

    const savedActiveCircleId = window.localStorage.getItem(SESSION_KEYS.activeCircle);

    let active = true;

    const loadCircles = async () => {
      setCirclesLoading(true);

      try {
        const response = await requestJson("/api/circles");

        if (active && Array.isArray(response.circles)) {
          setCircles(response.circles);

          if (savedActiveCircleId && response.circles.some(circle => circle.id === savedActiveCircleId)) {
            setActiveCircleId(savedActiveCircleId);
          } else if (savedActiveCircleId) {
            setActiveCircleId("");
          }
        }
      } catch (error) {
        console.error("Failed to load circles", error);
      } finally {
        if (active) {
          setCirclesLoading(false);
        }
      }
    };

    void loadCircles();

    return () => {
      active = false;
    };
  }, [sessionReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;
    window.localStorage.setItem(SESSION_KEYS.theme, theme);
  }, [sessionReady, theme]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;
    window.localStorage.setItem(SESSION_KEYS.privacy, JSON.stringify(privacy));
  }, [privacy, sessionReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;
    window.localStorage.setItem(SESSION_KEYS.mood, currentMood);
  }, [currentMood, sessionReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;

    if (activeCircleId) {
      window.localStorage.setItem(SESSION_KEYS.activeCircle, activeCircleId);
      return;
    }

    window.localStorage.removeItem(SESSION_KEYS.activeCircle);
  }, [activeCircleId, sessionReady]);

  useEffect(() => {
    if (!sessionReady) {
      return undefined;
    }

    let active = true;

    const loadPosts = async () => {
      try {
        const query = new URLSearchParams({
          viewerId: currentUserId,
          username,
          entryMethod: entryMethod || "guest",
        });
        const response = await requestJson(`/api/posts?${query.toString()}`);

        if (active && Array.isArray(response.posts)) {
          setPosts(response.posts);
        }
      } catch (error) {
        console.error("Failed to load posts", error);
      }
    };

    loadPosts();

    return () => {
      active = false;
    };
  }, [currentUserId, entryMethod, sessionReady, username]);

  const joinedCircles = circles.filter(circle => circle.members.some(member => member.id === currentUserId));
  const circleUnreadCount = joinedCircles.reduce((sum, circle) => sum + getCircleUnreadCount(circle, currentUserId), 0);
  const liveCircleCount = joinedCircles.filter(circle => isCircleLive(circle)).length;
  const openFeedbackCount = adminData.feedback.filter(item => item.status !== "resolved").length;
  const navItems = isSuperAdmin
    ? [...BASE_NAV, ADMIN_NAV_ITEM]
    : BASE_NAV;

  const loadAdminData = useCallback(async () => {
    if (!isSuperAdmin || !sessionProfile?.email) {
      setAdminData(DEFAULT_ADMIN_DATA);
      return;
    }

    setAdminLoading(true);

    try {
      const response = await requestJson(`/api/admin?viewerEmail=${encodeURIComponent(sessionProfile.email)}`);

      setAdminData({
        users: Array.isArray(response.users) ? response.users : [],
        feedback: Array.isArray(response.feedback) ? response.feedback : [],
        storage: response.storage || "",
        warning: response.warning || "",
        stats: response.stats || DEFAULT_ADMIN_DATA.stats,
      });

      if (Array.isArray(response.circles)) {
        setCircles(response.circles);
      }
    } catch (error) {
      console.error("Failed to load admin dashboard", error);
    } finally {
      setAdminLoading(false);
    }
  }, [isSuperAdmin, sessionProfile]);

  useEffect(() => {
    if (!sessionReady || isGuest || !sessionProfile?.email) return;

    const nextSyncSignature = JSON.stringify({
      email: sessionProfile.email,
      mood: currentMood,
      joinedCircleIds: joinedCircles.map(circle => circle.id).sort(),
    });

    if (lastUserSyncSignatureRef.current === nextSyncSignature) {
      return;
    }

    lastUserSyncSignatureRef.current = nextSyncSignature;

    let active = true;

    void requestJson("/api/users", {
      method: "POST",
      body: JSON.stringify({
        sessionProfile,
        currentMood,
        joinedCircleIds: joinedCircles.map(circle => circle.id),
      }),
    }).catch(error => {
      if (active) {
        lastUserSyncSignatureRef.current = "";
      }
      console.error("Failed to sync user state", error);
    });

    return () => {
      active = false;
    };
  }, [currentMood, isGuest, joinedCircles, sessionProfile, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !isSuperAdmin) {
      setAdminData(DEFAULT_ADMIN_DATA);
      return;
    }

    void loadAdminData();
  }, [isSuperAdmin, loadAdminData, sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;

    let active = true;

    const refreshCircles = async () => {
      try {
        const response = await requestJson("/api/circles");

        if (!active || !Array.isArray(response.circles)) {
          return;
        }

        setCircles(response.circles);

        if (activeCircleId && !response.circles.some(circle => circle.id === activeCircleId)) {
          setActiveCircleId("");
        }
      } catch (error) {
        console.error("Failed to refresh circles", error);
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshCircles();
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [activeCircleId, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !isSuperAdmin) return;

    const intervalId = window.setInterval(() => {
      void loadAdminData();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isSuperAdmin, loadAdminData, sessionReady]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const togglePrivacy = key => setPrivacy(p => ({ ...p, [key]: !p[key] }));
  const toggleMobileIdentity = () => setMobileIdentityOpen(open => !open);

  const persistCircleRequest = useCallback(async (method, body) => {
    const response = await requestJson("/api/circles", {
      method,
      body: JSON.stringify({
        ...body,
        sessionProfile,
        currentMood,
      }),
    });

    if (Array.isArray(response.circles)) {
      setCircles(response.circles);
    }

    if (isSuperAdmin) {
      void loadAdminData();
    }

    return response;
  }, [currentMood, isSuperAdmin, loadAdminData, sessionProfile]);

  const handleRequireAccount = useCallback(reason => {
    setMobileIdentityOpen(false);
    void router.push({
      pathname: "/",
      query: {
        sheet: "1",
        reason,
      },
    });
  }, [router]);

  const handleReact = useCallback((postId, type) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, reactions: { ...p.reactions, [type]: p.reacted[type] ? p.reactions[type] - 1 : p.reactions[type] + 1 }, reacted: { ...p.reacted, [type]: !p.reacted[type] } }
        : p
    ));
  }, []);

  const handleMoodChange = useCallback(nextMood => {
    const moodMeta = getMoodMeta(nextMood);

    setCurrentMood(nextMood);

    if (!currentUserId) {
      return;
    }

    setCircles(prevCircles => prevCircles.map(circle => ({
      ...circle,
      members: circle.members.map(member =>
        member.id === currentUserId
          ? { ...member, mood: nextMood, color: moodMeta.color }
          : member
      ),
    })));
  }, [currentUserId]);

  const handleMarkCircleRead = useCallback(async circleId => {
    try {
      await persistCircleRequest("PATCH", {
        action: "mark-read",
        circleId,
      });
    } catch (error) {
      console.error("Failed to mark circle as read", error);
    }
  }, [persistCircleRequest]);

  const handleOpenCircle = useCallback(async circleId => {
    setActiveCircleId(circleId);
    setView("circles");
    setMobileIdentityOpen(false);
    await handleMarkCircleRead(circleId);
  }, [handleMarkCircleRead]);

  const handleBackToCircleDirectory = useCallback(() => {
    setActiveCircleId("");
  }, []);

  const handleJoinCircle = useCallback(async circleId => {
    if (!sessionProfile) return;

    setActiveCircleId(circleId);
    setView("circles");
    setMobileIdentityOpen(false);
    try {
      await persistCircleRequest("PATCH", {
        action: "join",
        circleId,
      });
    } catch (error) {
      console.error("Failed to join circle", error);
    }
  }, [persistCircleRequest, sessionProfile]);

  const handleToggleHand = useCallback(async circleId => {
    if (!sessionProfile) return;
    try {
      await persistCircleRequest("PATCH", {
        action: "toggle-hand",
        circleId,
      });
    } catch (error) {
      console.error("Failed to toggle hand", error);
    }
  }, [persistCircleRequest, sessionProfile]);

  const handleInviteSpeaker = useCallback(async (circleId, memberId) => {
    try {
      await persistCircleRequest("PATCH", {
        action: "invite-speaker",
        circleId,
        memberId,
      });
    } catch (error) {
      console.error("Failed to invite speaker", error);
    }
  }, [persistCircleRequest]);

  const handleMoveToAudience = useCallback(async (circleId, memberId) => {
    try {
      await persistCircleRequest("PATCH", {
        action: "move-to-audience",
        circleId,
        memberId,
      });
    } catch (error) {
      console.error("Failed to move member to audience", error);
    }
  }, [persistCircleRequest]);

  const handleToggleRequests = useCallback(async circleId => {
    try {
      await persistCircleRequest("PATCH", {
        action: "toggle-requests",
        circleId,
      });
    } catch (error) {
      console.error("Failed to toggle requests", error);
    }
  }, [persistCircleRequest]);

  const handleToggleVoiceSession = useCallback(async circleId => {
    try {
      await persistCircleRequest("PATCH", {
        action: "toggle-voice-session",
        circleId,
      });
    } catch (error) {
      console.error("Failed to toggle voice session", error);
    }
  }, [persistCircleRequest]);

  const handleSendCircleMessage = useCallback(async (circleId, text) => {
    if (!sessionProfile || !text.trim()) return;
    try {
      await persistCircleRequest("PATCH", {
        action: "send-message",
        circleId,
        text: text.trim(),
      });
    } catch (error) {
      console.error("Failed to send circle message", error);
    }
  }, [persistCircleRequest, sessionProfile]);

  const handlePostAnnouncement = useCallback(async (circleId, text) => {
    if (!sessionProfile || !text.trim()) return;
    try {
      await persistCircleRequest("PATCH", {
        action: "post-announcement",
        circleId,
        text: text.trim(),
      });
    } catch (error) {
      console.error("Failed to post announcement", error);
    }
  }, [persistCircleRequest, sessionProfile]);

  const handleCreateCircle = useCallback(async circleDraft => {
    if (!isSuperAdmin || !sessionProfile) return;

    try {
      const response = await persistCircleRequest("POST", circleDraft);
      const createdCircle = Array.isArray(response.circles)
        ? response.circles.find(circle => !circles.some(existingCircle => existingCircle.id === circle.id)) || response.circles[0]
        : null;

      if (createdCircle?.id) {
        setActiveCircleId(createdCircle.id);
      }

      setView("circles");
      setMobileIdentityOpen(false);
    } catch (error) {
      console.error("Failed to create circle", error);
    }
  }, [circles, isSuperAdmin, persistCircleRequest, sessionProfile]);

  const handleDeleteCircle = useCallback(async circleId => {
    if (!isSuperAdmin) return;

    try {
      await persistCircleRequest("PATCH", {
        action: "delete-circle",
        circleId,
      });

      if (activeCircleId === circleId) {
        setActiveCircleId("");
      }
    } catch (error) {
      console.error("Failed to delete circle", error);
    }
  }, [activeCircleId, isSuperAdmin, persistCircleRequest]);

  const handleRemoveCircleMember = useCallback(async (circleId, memberId) => {
    try {
      await persistCircleRequest("PATCH", {
        action: "remove-member",
        circleId,
        memberId,
      });
    } catch (error) {
      console.error("Failed to remove member", error);
    }
  }, [persistCircleRequest]);

  const handleSetCircleMemberRole = useCallback(async (circleId, memberId, role) => {
    if (!isSuperAdmin) return;

    try {
      await persistCircleRequest("PATCH", {
        action: "update-member-role",
        circleId,
        memberId,
        role,
      });
    } catch (error) {
      console.error("Failed to update member role", error);
    }
  }, [isSuperAdmin, persistCircleRequest]);

  const handleSubmitFeedback = useCallback(async feedbackDraft => {
    await requestJson("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        ...feedbackDraft,
        sessionProfile,
      }),
    });

    if (isSuperAdmin) {
      void loadAdminData();
    }
  }, [isSuperAdmin, loadAdminData, sessionProfile]);

  const handleDeleteUser = useCallback(async targetEmail => {
    if (!sessionProfile?.email || !isSuperAdmin) return;

    await requestJson("/api/users", {
      method: "DELETE",
      body: JSON.stringify({
        viewerEmail: sessionProfile.email,
        targetEmail,
      }),
    });

    await loadAdminData();
  }, [isSuperAdmin, loadAdminData, sessionProfile]);

  const handleUpdateFeedbackStatus = useCallback(async (feedbackId, status) => {
    if (!sessionProfile?.email || !isSuperAdmin) return;

    await requestJson("/api/feedback", {
      method: "PATCH",
      body: JSON.stringify({
        feedbackId,
        status,
        viewerEmail: sessionProfile.email,
      }),
    });

    await loadAdminData();
  }, [isSuperAdmin, loadAdminData, sessionProfile]);

  const handleViewChange = useCallback((newView) => {
    if (isGuest && GATED_VIEWS.has(newView)) {
      handleRequireAccount(newView);
      return;
    }

    if (newView === "admin" && !isSuperAdmin) {
      return;
    }

    if (newView === "chat") {
      if (view !== "chat") {
        lastNonChatViewRef.current = view;
      }
    } else {
      lastNonChatViewRef.current = newView;
    }

    setView(newView);
    setMobileIdentityOpen(false); // Close mobile identity panel when navigating
  }, [handleRequireAccount, isGuest, isSuperAdmin, view]);

  const handleOpenCircleManage = useCallback(() => {
    setActiveCircleId("");
    setCirclesDirectoryTab("manage");
    handleViewChange("circles");
  }, [handleViewChange]);

  const handleOpenAdminSection = useCallback(nextAdminTab => {
    setAdminTab(nextAdminTab);
    handleViewChange("admin");
  }, [handleViewChange]);

  const handlePostPublished = useCallback(async postDraft => {
    const response = await requestJson("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        ...postDraft,
        authorId: currentUserId,
        username,
      }),
    });

    setPosts(prev => [response.post, ...prev.filter(post => post.id !== response.post.id)]);
    setHeardToast(true);
    setMobileIdentityOpen(false); // Close mobile identity panel after posting
    setTimeout(() => { setHeardToast(false); setView("home"); }, 2800);
  }, [currentUserId, username]);

  const handleLogout = useCallback(async () => {
    if (typeof window === "undefined" || loggingOut) return;

    setLoggingOut(true);
    setMobileIdentityOpen(false);

    clearSharePassSession(window.localStorage);

    try {
      await router.replace("/");
    } catch (error) {
      console.error("Logout navigation failed", error);
      setLoggingOut(false);
    }
  }, [loggingOut, router]);

  // Don't render until username is generated to avoid hydration mismatch
  if (!sessionReady || !username) {
    return (
      <div className="sp-app" data-theme={theme}>
        <div className="sp-ambient" />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'Onest, sans-serif',
          color: 'var(--text-muted)'
        }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`sp-app ${view === "chat" ? "chat-focus" : ""}`} data-theme={theme}>
        <div className="sp-ambient" />

        {/* Mobile Identity Toggle */}
        <button className={`mobile-identity-toggle mobile-visible ${mobileIdentityOpen ? "active" : ""}`} onClick={toggleMobileIdentity}>
          <Icon.Leaf />
        </button>

        {/* Mobile Identity Panel */}
        <div className={`mobile-identity-overlay ${mobileIdentityOpen ? 'open' : ''}`} onClick={toggleMobileIdentity} />
        <aside className={`mobile-identity-panel ${mobileIdentityOpen ? 'open' : ''}`}>
          <RightPanel
            circleUnreadCount={circleUnreadCount}
            currentUserId={currentUserId}
            currentMood={currentMood}
            joinedCircles={joinedCircles}
            username={username}
            isGuest={isGuest}
            isSuperAdmin={isSuperAdmin}
            entryMethod={entryMethod}
            liveCircleCount={liveCircleCount}
            onOpenAdminSection={handleOpenAdminSection}
            onOpenAdminView={() => handleViewChange("admin")}
            onMoodChange={handleMoodChange}
            onOpenCircle={handleOpenCircle}
            onOpenCircleManage={handleOpenCircleManage}
            onRequireAccount={handleRequireAccount}
            openFeedbackCount={openFeedbackCount}
          />
        </aside>

        {/* Sidebar */}
        <aside className="sp-sidebar">
          <div className="sp-logo"><Icon.Logo theme={theme} size={34} /></div>
          {navItems.map(n => (
            <button
              key={n.id}
              className={`sp-nav-btn ${n.id === "chat" ? "chat-nav-btn" : ""} ${isGuest && GATED_VIEWS.has(n.id) ? "restricted" : ""} ${view === n.id ? "active" : ""}`}
              onClick={() => handleViewChange(n.id)}
            >
              <n.Ic active={view === n.id} />
              <span className="sp-nav-label">{n.label}</span>
              {isGuest && GATED_VIEWS.has(n.id) && <span className="sp-nav-lock">+</span>}
              {n.id === "circles" && circleUnreadCount > 0 ? <span className="sp-nav-lock nav-count-lock">{circleUnreadCount}</span> : null}
              {n.id === "circles" && circleUnreadCount === 0 && liveCircleCount > 0 ? <span className="sp-nav-lock nav-live-lock">•</span> : null}
              {n.id === "admin" && openFeedbackCount > 0 ? <span className="sp-nav-lock nav-count-lock">{openFeedbackCount}</span> : null}
              <span className="sp-nav-tooltip">{n.label}</span>
            </button>
          ))}
          <button
            className={`sp-nav-btn mobile-profile-dock-btn ${isGuest ? "restricted" : ""} ${view === "profile" ? "active" : ""}`}
            onClick={() => handleViewChange("profile")}
            type="button"
          >
            <Icon.Profile active={view === "profile"} />
            <span className="sp-nav-label">Profile</span>
            {isGuest && <span className="sp-nav-lock">+</span>}
          </button>
          <div className="sp-sidebar-bottom">
            <button className={`sp-sidebar-utility ${isGuest ? "restricted" : ""} ${view === "profile" ? "active" : ""}`} onClick={() => handleViewChange("profile")} title="Profile">
              <Icon.Profile active={view === "profile"} />
              {isGuest && <span className="sp-nav-lock utility-lock">+</span>}
              <span className="sp-nav-tooltip">Profile</span>
            </button>
            <button className="sp-sidebar-utility" onClick={toggleTheme} title="Toggle display theme">
              {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
              <span className="sp-nav-tooltip">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>
        </aside>

        {/* Mobile action stack */}
        <div className="mobile-action-stack">
          <button className="mobile-theme-cta" onClick={toggleTheme} aria-label="Toggle display theme">
            {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
          </button>
          <button className="mobile-chat-cta" onClick={() => handleViewChange("chat")} aria-label="Open AI assistant">
            <span className="mobile-chat-cta-mark">
              <Icon.Assistant active />
            </span>
            <span className="mobile-chat-cta-copy">Assistant</span>
          </button>
        </div>

        {/* Main */}
        <main className={`sp-main ${view === "chat" ? "chat-main" : ""}`}>
          {view === "home"    && <HomeFeed currentUserId={currentUserId} isGuest={isGuest} posts={posts} onReact={handleReact} username={username} />}
          {view === "express" && <ExpressView onPostPublished={handlePostPublished} />}
          {view === "chat"    && <AIChat onBack={() => handleViewChange(lastNonChatViewRef.current || "home")} />}
          {view === "circles" && (
            <CirclesView
              activeCircleId={activeCircleId}
              circles={circles}
              circlesLoading={circlesLoading}
              currentMood={currentMood}
              directoryTab={circlesDirectoryTab}
              isGuest={isGuest}
              isSuperAdmin={isSuperAdmin}
              onDirectoryTabChange={setCirclesDirectoryTab}
              onBackToDirectory={handleBackToCircleDirectory}
              onCreateCircle={handleCreateCircle}
              onDeleteCircle={handleDeleteCircle}
              onInviteSpeaker={handleInviteSpeaker}
              onJoinCircle={handleJoinCircle}
              onMarkCircleRead={handleMarkCircleRead}
              onMoveToAudience={handleMoveToAudience}
              onOpenCircle={handleOpenCircle}
              onPostAnnouncement={handlePostAnnouncement}
              onRemoveCircleMember={handleRemoveCircleMember}
              onSetCircleMemberRole={handleSetCircleMemberRole}
              onRequireAccount={handleRequireAccount}
              onSendCircleMessage={handleSendCircleMessage}
              onToggleHand={handleToggleHand}
              onToggleRequests={handleToggleRequests}
              onToggleVoiceSession={handleToggleVoiceSession}
              sessionProfile={sessionProfile}
            />
          )}
          {view === "profile" && (
            <ProfileView
              currentUserId={currentUserId}
              currentMood={currentMood}
              circleUnreadCount={circleUnreadCount}
              entryMethod={entryMethod}
              isSuperAdmin={isSuperAdmin}
              joinedCircles={joinedCircles}
              liveCircleCount={liveCircleCount}
              username={username}
              privacyState={privacy}
              onMoodChange={handleMoodChange}
              onOpenCircle={handleOpenCircle}
              onSubmitFeedback={handleSubmitFeedback}
              onPrivacyToggle={togglePrivacy}
              onLogout={handleLogout}
              loggingOut={loggingOut}
            />
          )}
          {view === "admin" && (
            <AdminView
              adminData={adminData}
              adminLoading={adminLoading}
              adminTab={adminTab}
              circles={circles}
              currentUserEmail={sessionProfile?.email || ""}
              isSuperAdmin={isSuperAdmin}
              onDeleteCircle={handleDeleteCircle}
              onDeleteUser={handleDeleteUser}
              onOpenCircle={handleOpenCircle}
              onTabChange={setAdminTab}
              onUpdateFeedbackStatus={handleUpdateFeedbackStatus}
            />
          )}
        </main>

        {/* Right panel */}
        <aside className="sp-right">
          <RightPanel
            circleUnreadCount={circleUnreadCount}
            currentUserId={currentUserId}
            currentMood={currentMood}
            entryMethod={entryMethod}
            isGuest={isGuest}
            isSuperAdmin={isSuperAdmin}
            joinedCircles={joinedCircles}
            liveCircleCount={liveCircleCount}
            onOpenAdminSection={handleOpenAdminSection}
            onOpenAdminView={() => handleViewChange("admin")}
            onMoodChange={handleMoodChange}
            onOpenCircle={handleOpenCircle}
            onOpenCircleManage={handleOpenCircleManage}
            onRequireAccount={handleRequireAccount}
            openFeedbackCount={openFeedbackCount}
            username={username}
          />
        </aside>

        {/* "You are heard" toast */}
        {heardToast && (
          <div className="heard-toast">
            <div className="heard-icon"><Icon.Dove /></div>
            <div className="heard-msg">You are heard.</div>
            <div className="heard-sub">Your words have found their place.</div>
          </div>
        )}
      </div>
    </>
  );
}
