import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Icon from "./Icon";

const AUTH_OPTIONS = [
  {
    id: "google",
    label: "Continue with Google",
    meta: "Use your Gmail sign-in for a quick start.",
    Ic: Icon.Google,
    badge: "Fast",
  },
  {
    id: "apple",
    label: "Continue with Apple",
    meta: "A quieter entry with the same calm experience.",
    Ic: Icon.Apple,
    badge: "Private",
  },
  {
    id: "email",
    label: "Use email",
    meta: "Sign in with a familiar email-based flow.",
    Ic: Icon.Mail,
    badge: "Classic",
  },
  {
    id: "guest",
    label: "Stay anonymous for now",
    meta: "Enter immediately and keep the first step lightweight.",
    Ic: Icon.Guest,
    badge: "Guest",
  },
];

const ENTRY_POINTS = [
  {
    title: "Softer first impression",
    body: "The first screen now feels intentional instead of dropping people straight into the app.",
    Ic: Icon.Heart,
  },
  {
    title: "More product-like flow",
    body: "A real landing and sign-in layer makes GitHub demos and future auth easier to explain.",
    Ic: Icon.Shield,
  },
  {
    title: "iPhone-style motion",
    body: "Bottom-sheet movement gives the experience that familiar swipe-up mobile feel.",
    Ic: Icon.Rise,
  },
];

const PREVIEW_LINES = [
  "Breathe once. Then enter gently.",
  "Private by default, softer in tone.",
  "Choose how you want to step in today.",
];

export default function SharePassLanding() {
  const router = useRouter();
  const [theme, setTheme] = useState("dark");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phoneSheetRaised, setPhoneSheetRaised] = useState(false);
  const [highlightedMethod, setHighlightedMethod] = useState("google");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const savedTheme = window.localStorage.getItem("sharepass.theme");
    const savedMethod = window.localStorage.getItem("sharepass.entryMethod");

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }

    if (savedMethod) {
      setHighlightedMethod(savedMethod);
    }

    const timer = window.setTimeout(() => {
      setPhoneSheetRaised(true);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sharepass.theme", theme);
  }, [theme]);

  const handleEnter = async method => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sharepass.entryMethod", method);
    }

    await router.push("/app");
  };

  return (
    <div className="entry-page" data-theme={theme}>
      <div className="sp-ambient" />

      <button
        className="entry-theme-toggle"
        type="button"
        onClick={() => setTheme(currentTheme => currentTheme === "dark" ? "light" : "dark")}
        aria-label="Toggle display theme"
      >
        {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
      </button>

      <main className="entry-layout">
        <section className="entry-copy-panel">
          <div className="entry-brand">
            <div className="entry-brand-mark">
              <Icon.Logo />
            </div>
            <div className="entry-brand-copy">
              <span className="entry-brand-name">SharePass</span>
              <span className="entry-brand-tag">Emotional support system</span>
            </div>
          </div>

          <div className="section-pill">
            <Icon.Privacy />
            Gentle Sign In
          </div>

          <h1 className="entry-title">A warmer landing page before the support space opens.</h1>
          <p className="entry-lead">
            This entry flow adds a real front door to SharePass: modern, private-feeling, and shaped like a mobile
            sheet that lifts up from below instead of throwing people straight into the interface.
          </p>

          <div className="entry-points">
            {ENTRY_POINTS.map(({ title, body, Ic }) => (
              <article key={title} className="entry-point-card">
                <div className="entry-point-icon">
                  <Ic />
                </div>
                <div className="entry-point-copy">
                  <h2>{title}</h2>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="entry-action-row">
            <button className="entry-primary-btn" type="button" onClick={() => setSheetOpen(true)}>
              Open Sign-In Sheet
              <Icon.Rise />
            </button>
            <button className="entry-secondary-btn" type="button" onClick={() => handleEnter("guest")}>
              Continue Anonymously
            </button>
          </div>

          <div className="entry-trust-note">
            <Icon.Shield />
            <span>Your in-app identity still stays anonymous after entry.</span>
          </div>
        </section>

        <section className="entry-device-stage">
          <div className="entry-device">
            <div className="entry-device-notch" />
            <div className="entry-device-screen">
              <div className="entry-device-status">
                <span>9:41</span>
                <span>Secure Entry</span>
              </div>

              <div className="entry-preview-hero">
                <div className="entry-preview-badge">
                  <Icon.Assistant active />
                </div>
                <div className="entry-preview-copy">
                  <span className="entry-preview-kicker">New front door</span>
                  <strong>Sign in softly, then move into the app.</strong>
                </div>
              </div>

              <div className="entry-preview-lines">
                {PREVIEW_LINES.map(line => (
                  <div key={line} className="entry-preview-line">
                    <span className="entry-preview-line-dot" />
                    {line}
                  </div>
                ))}
              </div>

              <div className={`entry-phone-sheet ${phoneSheetRaised ? "raised" : ""}`}>
                <div className="entry-sheet-handle" />
                <div className="entry-phone-sheet-head">
                  <div>
                    <span className="entry-phone-sheet-kicker">Swipe-up style</span>
                    <h2>Choose a sign-in path</h2>
                  </div>
                  <button className="entry-mini-open" type="button" onClick={() => setSheetOpen(true)}>
                    Expand
                  </button>
                </div>

                <div className="entry-phone-auth-list">
                  {AUTH_OPTIONS.map(({ id, label, Ic, badge }) => (
                    <button
                      key={id}
                      className={`entry-phone-auth-option ${highlightedMethod === id ? "active" : ""}`}
                      type="button"
                      onMouseEnter={() => setHighlightedMethod(id)}
                      onFocus={() => setHighlightedMethod(id)}
                      onClick={() => {
                        setHighlightedMethod(id);
                        setSheetOpen(true);
                      }}
                    >
                      <span className="entry-phone-auth-icon">
                        <Ic />
                      </span>
                      <span className="entry-phone-auth-label">{label}</span>
                      <span className="entry-phone-auth-badge">{badge}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div
        className={`entry-sheet-backdrop ${sheetOpen ? "open" : ""}`}
        onClick={() => setSheetOpen(false)}
        aria-hidden={!sheetOpen}
      />

      <aside className={`entry-auth-sheet ${sheetOpen ? "open" : ""}`}>
        <div className="entry-sheet-handle" />
        <div className="entry-auth-sheet-top">
          <div>
            <div className="section-pill entry-sheet-pill">
              <Icon.Rise />
              Slide Up To Enter
            </div>
            <h2 className="entry-auth-title">Choose how you want to sign in.</h2>
            <p className="entry-auth-sub">
              The options below are styled like a real mobile entry flow, while still leading into your anonymous
              SharePass experience.
            </p>
          </div>

          <button className="entry-sheet-close" type="button" onClick={() => setSheetOpen(false)} aria-label="Close sign-in sheet">
            <Icon.Close />
          </button>
        </div>

        <div className="entry-auth-options">
          {AUTH_OPTIONS.map(({ id, label, meta, Ic, badge }) => (
            <button
              key={id}
              className={`entry-auth-option ${highlightedMethod === id ? "selected" : ""}`}
              type="button"
              onMouseEnter={() => setHighlightedMethod(id)}
              onFocus={() => setHighlightedMethod(id)}
              onClick={() => handleEnter(id)}
            >
              <span className="entry-auth-option-icon">
                <Ic />
              </span>
              <span className="entry-auth-option-copy">
                <span className="entry-auth-option-label">{label}</span>
                <span className="entry-auth-option-meta">{meta}</span>
              </span>
              <span className="entry-auth-option-badge">{badge}</span>
            </button>
          ))}
        </div>

        <div className="entry-auth-footer">
          <div className="entry-auth-footer-note">
            <Icon.Shield />
            <span>Demo sign-in options now, real auth integration later if you want to connect providers.</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
