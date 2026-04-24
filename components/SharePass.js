import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Icon from "./Icon";
import { CIRCLES, EMOTIONS, SEED_POSTS } from "../lib/sharepass-data";
import {
  clearSharePassSession,
  createSessionUsername,
  GATED_VIEWS,
  getSessionMethodLabel,
  isGuestEntry,
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

function CirclesView({ isGuest, onRequireAccount }) {
  if (isGuest) {
    return (
      <AccessGateView
        title="Support circles open after sign-in."
        body="Anonymous mode keeps the first step light. Choose a sign-in option when you want saved circles and deeper participation."
        onRequireAccount={() => onRequireAccount("circles")}
      />
    );
  }

  return (
    <div className="sp-panel">
      <div style={{ marginBottom: 22 }}>
        <div className="sp-h1">Support Circles</div>
        <div className="sp-sub">Small, anonymous groups around shared experiences. You are never alone in what you feel.</div>
      </div>
      {CIRCLES.map(c => (
        <div key={c.id} className="circle-card">
          <div className="circle-header">
            <span className="circle-icon">{c.icon}</span>
            <div>
              <div className="circle-topic">{c.topic}</div>
              <div className="circle-members">{c.members} members · Anonymous</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="member-dots">
              {c.colors.map((col, i) => (
                <div key={i} className="member-dot" style={{ background: col }} />
              ))}
              <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 14 }}>Active space</span>
            </div>
            <button className="join-btn">
              <Icon.Forward /> Join
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileView({ username, privacyState, onPrivacyToggle, onLogout, loggingOut }) {
  const controls = [
    ["Auto-delete posts after 7 days", "autoDelete"],
    ["Anonymous session rotation", "rotation"],
    ["Hide from search", "hideSearch"],
  ];
  return (
    <div className="sp-panel">
      <div style={{ marginBottom: 22 }}>
        <div className="sp-h1">Your Space</div>
        <div className="sp-sub">Anonymous. Safe. Yours.</div>
      </div>
      <div className="sp-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div className="profile-avatar"><Icon.Leaf /></div>
          <div>
            <div className="sp-h2">{username}</div>
            <div className="sp-sub" style={{ marginTop: 2 }}>Anonymous identity · No tracking</div>
          </div>
        </div>
        <div className="sp-label">Your patterns this week</div>
        {[["Most felt emotion","😤 Stress"],["Posts shared","3"],["Support given","12"],["Circles joined","1"]].map(([label, val]) => (
          <div key={label} className="stat-row">
            <span className="stat-label"><Icon.Forward /> {label}</span>
            <span className="stat-val">{val}</span>
          </div>
        ))}
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
function RightPanel({ username, isGuest, entryMethod, onRequireAccount }) {
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
              <span>Protected and secure</span>
            </div>
          </div>
        </div>
      </div>
      <div className="side-section">
        <div className="sp-label">Active Circles</div>
        {CIRCLES.slice(0, 2).map(c => (
          <div key={c.id} className="circle-mini">
            <span className="circle-mini-icon">{c.icon}</span>
            <div className="circle-mini-copy">
              <div className="circle-mini-title">{c.topic}</div>
              <div className="circle-mini-meta">{c.members} members</div>
            </div>
          </div>
        ))}
      </div>
      <div className="side-section">
        <div className="sp-label">Today&apos;s Mood</div>
        <div className="mood-grid">
          {EMOTIONS.slice(0, 4).map(e => (
            <button key={e.id} className="mood-chip" type="button">{e.icon}</button>
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
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const lastNonChatViewRef = useRef("home");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedEntryMethod = window.localStorage.getItem(SESSION_KEYS.entryMethod);

    if (!savedEntryMethod) {
      void router.replace("/");
      return;
    }

    setEntryMethod(savedEntryMethod);

    const savedUsername = window.localStorage.getItem(SESSION_KEYS.username);

    if (savedUsername) {
      setUsername(savedUsername);
      setSessionReady(true);
      return;
    }

    const generatedUsername = createSessionUsername(savedEntryMethod);
    window.localStorage.setItem(SESSION_KEYS.username, generatedUsername);
    setUsername(generatedUsername);
    setSessionReady(true);
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

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
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SESSION_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SESSION_KEYS.privacy, JSON.stringify(privacy));
  }, [privacy]);

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
      await router.push("/");
    } finally {
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
            username={username}
            isGuest={isGuest}
            entryMethod={entryMethod}
            onRequireAccount={handleRequireAccount}
          />
        </aside>

        {/* Sidebar */}
        <aside className="sp-sidebar">
          <div className="sp-logo"><Icon.Logo /></div>
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
          {view === "circles" && <CirclesView isGuest={isGuest} onRequireAccount={handleRequireAccount} />}
          {view === "profile" && (
            <ProfileView
              username={username}
              privacyState={privacy}
              onPrivacyToggle={togglePrivacy}
              onLogout={handleLogout}
              loggingOut={loggingOut}
            />
          )}
        </main>

        {/* Right panel */}
        <aside className="sp-right">
          <RightPanel username={username} isGuest={isGuest} entryMethod={entryMethod} onRequireAccount={handleRequireAccount} />
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
