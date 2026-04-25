import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Icon from "./Icon";
import { EMOTIONS, formatRelativeTime, SEED_POSTS } from "../lib/sharepass-data";
import {
  createCircleFromDraft,
  createCircleMember,
  createCircleMessage,
  createCurrentMemberId,
  createSeedCircles,
  getCircleAudience,
  getCircleMember,
  getCirclePreviewColors,
  getCircleSpeakers,
} from "../lib/sharepass-circles";
import {
  clearSharePassSession,
  ensureSuperAdminEmails,
  GATED_VIEWS,
  getSharePassSession,
  getSessionMethodLabel,
  isSuperAdminSession,
  isGuestEntry,
  saveSharePassSession,
  SESSION_KEYS,
} from "../lib/sharepass-session";

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
    throw new Error(payload?.error || "Something went wrong. Please try again.");
  }

  return payload;
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
  return (
    <div className="post-card">
      <div className="post-header">
        <div className="post-avatar" style={{ background: post.avatarBg }}>{post.avatar}</div>
        <div className="post-meta">
          <div className="post-username">{post.username}</div>
          <div className="post-time">{post.time}</div>
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
function HomeFeed({ posts, onReact }) {
  return (
    <div className="sp-panel">
      <div className="feed-header">
        <div>
          <div className="section-pill">Community Chats</div>
          <div className="sp-h1">Real people, honest check-ins.</div>
          <div className="sp-sub">Anonymous voices sharing what is heavy, hopeful, or hard to say out loud.</div>
        </div>
      </div>
      {posts.map(p => <PostCard key={p.id} post={p} onReact={onReact} />)}
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
  }, [maxComposerHeight]);

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

function CircleMemberRow({ member, badge, actionLabel, onAction }) {
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
      {onAction && (
        <button className="join-btn circle-member-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function CircleMessageRow({ message }) {
  const isAnnouncement = message.type === "announcement";

  return (
    <div className={`circle-chat-row ${isAnnouncement ? "announcement" : ""}`}>
      <div className="circle-chat-meta">
        <strong>{message.author}</strong>
        <span>{formatRelativeTime(message.createdAt)}</span>
      </div>
      <p>{message.text}</p>
    </div>
  );
}

function CirclesView({
  circles,
  activeCircleId,
  currentMood,
  isGuest,
  isSuperAdmin,
  onBackToDirectory,
  onCreateCircle,
  onJoinCircle,
  onMoveToAudience,
  onOpenCircle,
  onPostAnnouncement,
  onRequireAccount,
  onSendCircleMessage,
  onToggleHand,
  onToggleRequests,
  onInviteSpeaker,
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

  useEffect(() => {
    setChatDraft("");
    setAnnouncementDraft("");
  }, [activeCircleId]);

  const currentUserId = createCurrentMemberId(sessionProfile);
  const activeCircle = circles.find(circle => circle.id === activeCircleId) || null;
  const joinedCircles = circles.filter(circle => circle.members.some(member => member.id === currentUserId));

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
    const speakers = getCircleSpeakers(activeCircle);
    const audience = getCircleAudience(activeCircle);
    const queuedMembers = activeCircle.requestQueue
      .map(memberId => getCircleMember(activeCircle, memberId))
      .filter(Boolean);
    const latestAnnouncement = activeCircle.announcements[0] || null;
    const isCurrentUserSpeaker = activeCircle.speakers.includes(currentUserId);
    const isCurrentUserQueued = activeCircle.requestQueue.includes(currentUserId);

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
            <div className="assistant-glance-pill">{activeCircle.allowRequests ? "Raise hand on" : "Raise hand paused"}</div>
          </div>
        </div>

        {latestAnnouncement && (
          <div className="circle-announce-banner">
            <div className="circle-announce-copy">
              <span className="sp-label">Latest admin note</span>
              <strong>{latestAnnouncement.title}</strong>
              <p>{latestAnnouncement.body}</p>
            </div>
            <span className="circle-announce-time">{formatRelativeTime(latestAnnouncement.createdAt)}</span>
          </div>
        )}

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

          <div className="circle-room-actions">
            {!currentMember && (
              <button className="sp-btn sp-btn-primary" type="button" onClick={() => onJoinCircle(activeCircle.id)}>
                Join Circle
                <Icon.Forward />
              </button>
            )}

            {currentMember && !isCurrentUserSpeaker && (
              <button
                className={`sp-btn ${isCurrentUserQueued ? "sp-btn-ghost" : "sp-btn-primary"}`}
                type="button"
                onClick={() => onToggleHand(activeCircle.id)}
                disabled={!activeCircle.allowRequests && !isCurrentUserQueued}
              >
                {isCurrentUserQueued ? "Lower Hand" : "Raise Hand"}
              </button>
            )}

            {currentMember && isCurrentUserSpeaker && (
              <button className="sp-btn sp-btn-ghost" type="button" onClick={() => onMoveToAudience(activeCircle.id, currentUserId)}>
                Move To Audience
              </button>
            )}

            {isSuperAdmin && (
              <button className="sp-btn sp-btn-ghost" type="button" onClick={() => onToggleRequests(activeCircle.id)}>
                {activeCircle.allowRequests ? "Pause Requests" : "Resume Requests"}
              </button>
            )}
          </div>

          <div className="circle-stage-grid">
            <div className="circle-stage-column">
              <div className="sp-label">Speaking Now</div>
              <div className="circle-member-stack">
                {speakers.length > 0 ? speakers.map(member => (
                  <CircleMemberRow
                    key={member.id}
                    member={member}
                    badge={member.role === "moderator" ? "Moderator" : "Speaker"}
                    actionLabel={isSuperAdmin && member.role !== "moderator" ? "Audience" : undefined}
                    onAction={isSuperAdmin && member.role !== "moderator" ? () => onMoveToAudience(activeCircle.id, member.id) : undefined}
                  />
                )) : <div className="circle-empty-note">No one is on the floor yet. A moderator can invite the first speaker.</div>}
              </div>
            </div>

            <div className="circle-stage-column">
              <div className="sp-label">Raised Hands</div>
              <div className="circle-member-stack">
                {queuedMembers.length > 0 ? queuedMembers.map(member => (
                  <CircleMemberRow
                    key={member.id}
                    member={member}
                    badge="Waiting"
                    actionLabel={isSuperAdmin ? "Invite" : undefined}
                    onAction={isSuperAdmin ? () => onInviteSpeaker(activeCircle.id, member.id) : undefined}
                  />
                )) : <div className="circle-empty-note">The queue is quiet right now. Members can raise a hand when they are ready.</div>}
              </div>
            </div>

            <div className="circle-stage-column">
              <div className="sp-label">Listening In</div>
              <div className="circle-member-stack">
                {audience.length > 0 ? audience.map(member => (
                  <CircleMemberRow key={member.id} member={member} badge={member.id === currentUserId ? "You" : "Listening"} />
                )) : <div className="circle-empty-note">Everyone currently listed is on the floor.</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="circle-chat-card">
          <div className="circle-card-head">
            <div>
              <div className="sp-label">Circle Chat</div>
              <div className="sp-h2">Talk like a group thread</div>
            </div>
            <span className="circle-chat-hint">Share, laugh, encourage, or drop a resource after the speaker finishes.</span>
          </div>

          <div className="circle-chat-feed">
            {activeCircle.chat.map(message => (
              <CircleMessageRow key={message.id} message={message} />
            ))}
          </div>

          {currentMember ? (
            <div className="circle-chat-composer">
              <textarea
                className="chat-input chat-input-multiline"
                placeholder="Write into the circle chat..."
                value={chatDraft}
                rows={1}
                onChange={event => setChatDraft(event.target.value)}
              />
              <button
                className="chat-send-btn"
                type="button"
                disabled={!chatDraft.trim()}
                onClick={() => {
                  onSendCircleMessage(activeCircle.id, chatDraft);
                  setChatDraft("");
                }}
              >
                <Icon.Send />
              </button>
            </div>
          ) : (
            <div className="circle-empty-note">Join the circle first so your messages and raised hands are tied to your identity in this room.</div>
          )}
        </div>

        <div className="circle-support-grid">
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

          <div className="sp-card">
            <div className="sp-label">Your presence here</div>
            <div className="circle-presence-card">
              <strong>{currentMember ? "You are part of this circle" : "You are not in this circle yet"}</strong>
              <p>
                {currentMember
                  ? `You joined as ${currentMember.role === "moderator" ? "a moderator" : "a listener"} and your mood is currently marked as ${getMoodMeta(currentMood).label.toLowerCase()}.`
                  : "Join the circle to listen in, chat with the group, and raise your hand when you are ready to speak."}
              </p>
            </div>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="circle-admin-card">
            <div className="circle-card-head">
              <div>
                <div className="sp-label">Super Admin</div>
                <div className="sp-h2">Moderation controls</div>
              </div>
              <span className="circle-room-status open">Admin</span>
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
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sp-panel">
      <div style={{ marginBottom: 22 }}>
        <div className="sp-h1">Support Circles</div>
        <div className="sp-sub">Join a circle, move into the live room, raise your hand when you need the floor, and keep chatting together between turns.</div>
      </div>

      {joinedCircles.length > 0 && (
        <div className="sp-card circle-joined-strip">
          <div className="sp-label">Your joined spaces</div>
          <div className="circle-joined-list">
            {joinedCircles.map(circle => (
              <button key={circle.id} className="circle-room-pill" type="button" onClick={() => onOpenCircle(circle.id)}>
                <span>{circle.icon}</span>
                {circle.topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {isSuperAdmin && (
        <div className="sp-card circle-create-card">
          <div className="circle-card-head">
            <div>
              <div className="sp-label">Super Admin Console</div>
              <div className="sp-h2">Create and manage circles</div>
            </div>
            <span className="circle-room-status open">Moderator Tools</span>
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
      )}

      {circles.map(circle => {
        const joined = circle.members.some(member => member.id === currentUserId);
        const previewColors = getCirclePreviewColors(circle);

        return (
          <div key={circle.id} className="circle-card">
            <div className="circle-header">
              <span className="circle-icon">{circle.icon}</span>
              <div>
                <div className="circle-topic">{circle.topic}</div>
                <div className="circle-members">{circle.members.length} members · {circle.schedule}</div>
              </div>
            </div>

            <div className="sp-sub" style={{ marginBottom: 14 }}>{circle.description}</div>

            <div className="circle-card-meta-row">
              <div className="member-dots">
                {previewColors.map((color, index) => (
                  <div key={`${circle.id}-${index}`} className="member-dot" style={{ background: color }} />
                ))}
                <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 14 }}>
                  {circle.speakers.length} on the floor · {circle.requestQueue.length} hands raised
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
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileView({
  currentMood,
  isSuperAdmin,
  joinedCircles,
  loggingOut,
  onLogout,
  onMoodChange,
  onOpenCircle,
  privacyState,
  onPrivacyToggle,
  username,
}) {
  const controls = [
    ["Auto-delete posts after 7 days", "autoDelete"],
    ["Anonymous session rotation", "rotation"],
    ["Hide from search", "hideSearch"],
  ];
  const mood = getMoodMeta(currentMood);

  return (
    <div className="sp-panel">
      <div style={{ marginBottom: 22 }}>
        <div className="sp-h1">Your Space</div>
        <div className="sp-sub">Your identity, mood, joined circles, and session controls all stay together here.</div>
      </div>
      <div className="sp-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div className="profile-avatar"><Icon.Leaf /></div>
          <div>
            <div className="sp-h2">{username}</div>
            <div className="sp-sub" style={{ marginTop: 2 }}>
              {isSuperAdmin ? "Super admin · manages circles and room announcements" : "Signed-in identity · protected and quiet"}
            </div>
          </div>
        </div>
        <div className="sp-label">Your state right now</div>
        {[["Today's mood", `${mood.icon} ${mood.label}`],["Circles joined", String(joinedCircles.length)],["Room role", isSuperAdmin ? "Super admin" : "Member"]].map(([label, val]) => (
          <div key={label} className="stat-row">
            <span className="stat-label"><Icon.Forward /> {label}</span>
            <span className="stat-val">{val}</span>
          </div>
        ))}
      </div>
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
      <div className="sp-card">
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
  );
}

// ─── RIGHT PANEL ──────────────────────────────────────────────────────────────
function RightPanel({
  currentMood,
  entryMethod,
  isGuest,
  isSuperAdmin,
  joinedCircles,
  onMoodChange,
  onOpenCircle,
  onRequireAccount,
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
        <div className="sp-label">Your Circles</div>
        {joinedCircles.length > 0 ? joinedCircles.slice(0, 3).map(circle => (
          <button key={circle.id} className="circle-mini circle-mini-button" type="button" onClick={() => onOpenCircle(circle.id)}>
            <span className="circle-mini-icon">{circle.icon}</span>
            <div className="circle-mini-copy">
              <div className="circle-mini-title">{circle.topic}</div>
              <div className="circle-mini-meta">{circle.members.length} members</div>
            </div>
            <Icon.Forward />
          </button>
        )) : (
          <div className="circle-empty-note">Join a circle to get quick access to its live room, queue, and chat.</div>
        )}
      </div>
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

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const NAV = [
  { id: "home",    label: "Chats",   Ic: Icon.Chat    },
  { id: "express", label: "Express", Ic: Icon.Express },
  { id: "chat",    label: "AI Assist", Ic: Icon.Assistant },
  { id: "circles", label: "Circles", Ic: Icon.Circles },
];

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function SharePass() {
  const router = useRouter();
  const [view, setView] = useState("home");
  const [posts, setPosts] = useState(SEED_POSTS);
  const [heardToast, setHeardToast] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [privacy, setPrivacy] = useState({ autoDelete: true, rotation: false, hideSearch: true });
  const [mobileIdentityOpen, setMobileIdentityOpen] = useState(false);
  const [entryMethod, setEntryMethod] = useState("");
  const [username, setUsername] = useState("");
  const [sessionProfile, setSessionProfile] = useState(null);
  const [currentMood, setCurrentMood] = useState("hopeful");
  const [circles, setCircles] = useState([]);
  const [activeCircleId, setActiveCircleId] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const lastNonChatViewRef = useRef("home");

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

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;

    const savedTheme = window.localStorage.getItem(SESSION_KEYS.theme);
    const savedPrivacy = window.localStorage.getItem(SESSION_KEYS.privacy);

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }

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

    const savedCircles = window.localStorage.getItem(SESSION_KEYS.circles);
    let nextCircles = createSeedCircles();

    if (savedCircles) {
      try {
        const parsedCircles = JSON.parse(savedCircles);

        if (Array.isArray(parsedCircles) && parsedCircles.length > 0) {
          nextCircles = parsedCircles;
        }
      } catch {
        window.localStorage.removeItem(SESSION_KEYS.circles);
      }
    }

    setCircles(nextCircles);

    const savedActiveCircleId = window.localStorage.getItem(SESSION_KEYS.activeCircle);

    if (savedActiveCircleId && nextCircles.some(circle => circle.id === savedActiveCircleId)) {
      setActiveCircleId(savedActiveCircleId);
    }
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
    if (typeof window === "undefined" || !sessionReady || circles.length === 0) return;
    window.localStorage.setItem(SESSION_KEYS.circles, JSON.stringify(circles));
  }, [circles, sessionReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;

    if (activeCircleId) {
      window.localStorage.setItem(SESSION_KEYS.activeCircle, activeCircleId);
      return;
    }

    window.localStorage.removeItem(SESSION_KEYS.activeCircle);
  }, [activeCircleId, sessionReady]);

  useEffect(() => {
    let active = true;

    const loadPosts = async () => {
      try {
        const response = await requestJson("/api/posts");

        if (active && Array.isArray(response.posts) && response.posts.length > 0) {
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
  }, []);

  const isGuest = isGuestEntry(entryMethod);
  const currentUserId = sessionProfile ? createCurrentMemberId(sessionProfile) : "";
  const joinedCircles = circles.filter(circle => circle.members.some(member => member.id === currentUserId));

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const togglePrivacy = key => setPrivacy(p => ({ ...p, [key]: !p[key] }));
  const toggleMobileIdentity = () => setMobileIdentityOpen(open => !open);

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

  const handleOpenCircle = useCallback(circleId => {
    setActiveCircleId(circleId);
    setView("circles");
    setMobileIdentityOpen(false);
  }, []);

  const handleBackToCircleDirectory = useCallback(() => {
    setActiveCircleId("");
  }, []);

  const handleJoinCircle = useCallback(circleId => {
    if (!sessionProfile) return;

    const moodMeta = getMoodMeta(currentMood);
    const memberId = createCurrentMemberId(sessionProfile);
    const memberName = sessionProfile.displayName || sessionProfile.username || username;

    setCircles(prevCircles => prevCircles.map(circle => {
      if (circle.id !== circleId) return circle;
      if (circle.members.some(member => member.id === memberId)) return circle;

      const newMember = createCircleMember({
        id: memberId,
        name: memberName,
        role: isSuperAdmin ? "moderator" : "member",
        mood: currentMood,
        color: moodMeta.color,
        email: sessionProfile.email,
      });

      return {
        ...circle,
        members: [...circle.members, newMember],
        chat: [
          ...circle.chat,
          createCircleMessage({
            author: memberName,
            text: isSuperAdmin
              ? "I joined this room to help guide the floor and keep the space safe."
              : "I joined the room and I am listening in for now.",
          }),
        ],
      };
    }));

    setActiveCircleId(circleId);
    setView("circles");
    setMobileIdentityOpen(false);
  }, [currentMood, isSuperAdmin, sessionProfile, username]);

  const handleToggleHand = useCallback(circleId => {
    if (!sessionProfile) return;

    const memberId = createCurrentMemberId(sessionProfile);
    const memberName = sessionProfile.displayName || sessionProfile.username || username;

    setCircles(prevCircles => prevCircles.map(circle => {
      if (circle.id !== circleId) return circle;
      if (!circle.members.some(member => member.id === memberId) || circle.speakers.includes(memberId)) return circle;

      const isQueued = circle.requestQueue.includes(memberId);
      const nextQueue = isQueued
        ? circle.requestQueue.filter(queueMemberId => queueMemberId !== memberId)
        : [...circle.requestQueue, memberId];

      return {
        ...circle,
        requestQueue: nextQueue,
        chat: [
          ...circle.chat,
          createCircleMessage({
            author: "Room",
            text: isQueued
              ? `${memberName} lowered their hand for now.`
              : `${memberName} raised a hand to speak when the floor opens.`,
            type: "announcement",
          }),
        ],
      };
    }));
  }, [sessionProfile, username]);

  const handleInviteSpeaker = useCallback((circleId, memberId) => {
    if (!isSuperAdmin) return;

    setCircles(prevCircles => prevCircles.map(circle => {
      if (circle.id !== circleId || circle.speakers.includes(memberId)) return circle;

      const invitedMember = getCircleMember(circle, memberId);

      if (!invitedMember) return circle;

      return {
        ...circle,
        speakers: [...circle.speakers, memberId],
        requestQueue: circle.requestQueue.filter(queueMemberId => queueMemberId !== memberId),
        chat: [
          ...circle.chat,
          createCircleMessage({
            author: "Moderator",
            text: `${invitedMember.name} was invited to the floor.`,
            type: "announcement",
          }),
        ],
      };
    }));
  }, [isSuperAdmin]);

  const handleMoveToAudience = useCallback((circleId, memberId) => {
    setCircles(prevCircles => prevCircles.map(circle => {
      if (circle.id !== circleId || !circle.speakers.includes(memberId)) return circle;

      const member = getCircleMember(circle, memberId);

      return {
        ...circle,
        speakers: circle.speakers.filter(speakerId => speakerId !== memberId),
        chat: [
          ...circle.chat,
          createCircleMessage({
            author: "Room",
            text: `${member?.name || "A speaker"} moved back to the audience.`,
            type: "announcement",
          }),
        ],
      };
    }));
  }, []);

  const handleToggleRequests = useCallback(circleId => {
    if (!isSuperAdmin) return;

    setCircles(prevCircles => prevCircles.map(circle => {
      if (circle.id !== circleId) return circle;

      const allowRequests = !circle.allowRequests;

      return {
        ...circle,
        allowRequests,
        chat: [
          ...circle.chat,
          createCircleMessage({
            author: "Moderator",
            text: allowRequests
              ? "Raise hand requests are open again."
              : "Raise hand requests are paused for the moment.",
            type: "announcement",
          }),
        ],
      };
    }));
  }, [isSuperAdmin]);

  const handleSendCircleMessage = useCallback((circleId, text) => {
    if (!sessionProfile || !text.trim()) return;

    const memberId = createCurrentMemberId(sessionProfile);
    const memberName = sessionProfile.displayName || sessionProfile.username || username;

    setCircles(prevCircles => prevCircles.map(circle => {
      if (circle.id !== circleId || !circle.members.some(member => member.id === memberId)) return circle;

      return {
        ...circle,
        chat: [...circle.chat, createCircleMessage({ author: memberName, text: text.trim() })],
      };
    }));
  }, [sessionProfile, username]);

  const handlePostAnnouncement = useCallback((circleId, text) => {
    if (!isSuperAdmin || !sessionProfile || !text.trim()) return;

    const author = sessionProfile.displayName || sessionProfile.username || username;
    const createdAt = new Date().toISOString();

    setCircles(prevCircles => prevCircles.map(circle => {
      if (circle.id !== circleId) return circle;

      const announcement = {
        id: `announcement-${Date.now()}`,
        title: "Room update",
        body: text.trim(),
        createdAt,
        author,
      };

      return {
        ...circle,
        announcements: [announcement, ...circle.announcements],
        chat: [...circle.chat, createCircleMessage({ author, text: text.trim(), type: "announcement", createdAt })],
      };
    }));
  }, [isSuperAdmin, sessionProfile, username]);

  const handleCreateCircle = useCallback(circleDraft => {
    if (!isSuperAdmin || !sessionProfile) return;

    const moodMeta = getMoodMeta(currentMood);
    const authorName = sessionProfile.displayName || sessionProfile.username || username;
    const adminMemberId = createCurrentMemberId(sessionProfile);
    const nextCircle = createCircleFromDraft({
      ...circleDraft,
      createdBy: sessionProfile,
    });

    nextCircle.members = [
      createCircleMember({
        id: adminMemberId,
        name: authorName,
        role: "moderator",
        mood: currentMood,
        color: moodMeta.color,
        email: sessionProfile.email,
      }),
    ];
    nextCircle.speakers = [adminMemberId];

    setCircles(prevCircles => [nextCircle, ...prevCircles]);
    setActiveCircleId(nextCircle.id);
    setView("circles");
    setMobileIdentityOpen(false);
  }, [currentMood, isSuperAdmin, sessionProfile, username]);

  const handleViewChange = useCallback((newView) => {
    if (isGuest && GATED_VIEWS.has(newView)) {
      handleRequireAccount(newView);
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
  }, [handleRequireAccount, isGuest, view]);

  const handlePostPublished = useCallback(async postDraft => {
    const response = await requestJson("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        ...postDraft,
        username,
      }),
    });

    setPosts(prev => [response.post, ...prev.filter(post => post.id !== response.post.id)]);
    setHeardToast(true);
    setMobileIdentityOpen(false); // Close mobile identity panel after posting
    setTimeout(() => { setHeardToast(false); setView("home"); }, 2800);
  }, [username]);

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
            currentMood={currentMood}
            joinedCircles={joinedCircles}
            username={username}
            isGuest={isGuest}
            isSuperAdmin={isSuperAdmin}
            entryMethod={entryMethod}
            onMoodChange={handleMoodChange}
            onOpenCircle={handleOpenCircle}
            onRequireAccount={handleRequireAccount}
          />
        </aside>

        {/* Sidebar */}
        <aside className="sp-sidebar">
          <div className="sp-logo"><Icon.Logo theme={theme} size={34} /></div>
          {NAV.map(n => (
            <button
              key={n.id}
              className={`sp-nav-btn ${n.id === "chat" ? "chat-nav-btn" : ""} ${isGuest && GATED_VIEWS.has(n.id) ? "restricted" : ""} ${view === n.id ? "active" : ""}`}
              onClick={() => handleViewChange(n.id)}
            >
              <n.Ic active={view === n.id} />
              <span className="sp-nav-label">{n.label}</span>
              {isGuest && GATED_VIEWS.has(n.id) && <span className="sp-nav-lock">+</span>}
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
          {view === "home"    && <HomeFeed posts={posts} onReact={handleReact} />}
          {view === "express" && <ExpressView onPostPublished={handlePostPublished} />}
          {view === "chat"    && <AIChat onBack={() => handleViewChange(lastNonChatViewRef.current || "home")} />}
          {view === "circles" && (
            <CirclesView
              activeCircleId={activeCircleId}
              circles={circles}
              currentMood={currentMood}
              isGuest={isGuest}
              isSuperAdmin={isSuperAdmin}
              onBackToDirectory={handleBackToCircleDirectory}
              onCreateCircle={handleCreateCircle}
              onInviteSpeaker={handleInviteSpeaker}
              onJoinCircle={handleJoinCircle}
              onMoveToAudience={handleMoveToAudience}
              onOpenCircle={handleOpenCircle}
              onPostAnnouncement={handlePostAnnouncement}
              onRequireAccount={handleRequireAccount}
              onSendCircleMessage={handleSendCircleMessage}
              onToggleHand={handleToggleHand}
              onToggleRequests={handleToggleRequests}
              sessionProfile={sessionProfile}
            />
          )}
          {view === "profile" && (
            <ProfileView
              currentMood={currentMood}
              isSuperAdmin={isSuperAdmin}
              joinedCircles={joinedCircles}
              username={username}
              privacyState={privacy}
              onMoodChange={handleMoodChange}
              onOpenCircle={handleOpenCircle}
              onPrivacyToggle={togglePrivacy}
              onLogout={handleLogout}
              loggingOut={loggingOut}
            />
          )}
        </main>

        {/* Right panel */}
        <aside className="sp-right">
          <RightPanel
            currentMood={currentMood}
            entryMethod={entryMethod}
            isGuest={isGuest}
            isSuperAdmin={isSuperAdmin}
            joinedCircles={joinedCircles}
            onMoodChange={handleMoodChange}
            onOpenCircle={handleOpenCircle}
            onRequireAccount={handleRequireAccount}
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
