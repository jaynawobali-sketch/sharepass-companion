import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Icon from "./Icon";
import {
  createSessionProfile,
  GATED_VIEW_COPY,
  getSavedProviderAccounts,
  saveProviderAccount,
  saveSharePassSession,
  SESSION_KEYS,
} from "../lib/sharepass-session";

const AUTH_OPTIONS = [
  {
    id: "google",
    label: "Continue with Google",
    meta: "Pick a Google account, authorize it, and jump in quickly.",
    Ic: Icon.Google,
    badge: "Fast",
  },
  {
    id: "apple",
    label: "Continue with Apple",
    meta: "Sign in privately and choose whether to keep your email hidden.",
    Ic: Icon.Apple,
    badge: "Private",
  },
  {
    id: "email",
    label: "Use email",
    meta: "Create an account or sign back in with the email flow on this device.",
    Ic: Icon.Mail,
    badge: "Classic",
  },
  {
    id: "guest",
    label: "Stay anonymous for now",
    meta: "Enter immediately and keep the first step light.",
    Ic: Icon.Guest,
    badge: "Guest",
  },
];

const ENTRY_POINTS = [
  {
    title: "Anonymous posting",
    body: "Share what is heavy, hopeful, or hard to say out loud without exposing your real identity.",
    Ic: Icon.Privacy,
  },
  {
    title: "Emotionally aware AI",
    body: "Express mode and the assistant both respond in a softer tone built for reflection instead of pressure.",
    Ic: Icon.Assistant,
  },
  {
    title: "Support circles",
    body: "Signed-in sessions unlock circles, profile controls, and more persistent community features.",
    Ic: Icon.Circles,
  },
];

const PREVIEW_LINES = [
  "Select an account, authorize it, and move in without friction.",
  "Guest mode still keeps Feed, Express, and AI Assist open right away.",
  "Signed-in sessions unlock circles, profile access, and saved identity.",
];

const PLATFORM_PANELS = [
  {
    title: "What SharePass is",
    body: "A support-oriented emotional space for anonymous expression, gentle AI reflection, and quieter community interaction.",
  },
  {
    title: "What anonymous mode gives you",
    body: "Feed, Express, and AI Assist stay available so someone can get relief quickly without committing to a full profile.",
  },
  {
    title: "What sign-in unlocks",
    body: "Profile access, support circles, saved preferences, and future account-based features once you choose a sign-in path.",
  },
];

const MOBILE_TYPING_LINES = [
  "Going back to yourself can start with one honest sentence.",
  "Changing the tone of the day can begin in a softer space.",
  "Share, reflect, and move forward a little lighter.",
];

const EMPTY_PROVIDER_ACCOUNTS = {
  google: [],
  apple: [],
  email: [],
};

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function createPrivateRelayEmail(email) {
  const [localPart = "sharepass"] = String(email || "").trim().toLowerCase().split("@");
  const safeLocalPart = localPart.replace(/[^a-z0-9]+/g, "").slice(0, 18) || "sharepass";
  return `${safeLocalPart}@privaterelay.sharepass.local`;
}

function createSavedAccountState(storage) {
  if (!storage) {
    return EMPTY_PROVIDER_ACCOUNTS;
  }

  return {
    google: getSavedProviderAccounts(storage, "google"),
    apple: getSavedProviderAccounts(storage, "apple"),
    email: getSavedProviderAccounts(storage, "email"),
  };
}

function RememberedAccountButton({ account, actionLabel, onClick, disabled }) {
  return (
    <button className="entry-account-option" type="button" onClick={onClick} disabled={disabled}>
      <span className="entry-account-avatar">{account.avatarLabel || account.displayName?.charAt(0) || "S"}</span>
      <span className="entry-account-copy">
        <span className="entry-account-name">{account.displayName}</span>
        <span className="entry-account-email">{account.email || "Authorized on this device"}</span>
      </span>
      <span className="entry-account-action">{actionLabel}</span>
    </button>
  );
}

export default function SharePassLanding() {
  const router = useRouter();
  const hasRealGoogleOAuth = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
  const [theme, setTheme] = useState("dark");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState("methods");
  const [phoneSheetRaised, setPhoneSheetRaised] = useState(false);
  const [highlightedMethod, setHighlightedMethod] = useState("google");
  const [redirectReason, setRedirectReason] = useState("");
  const [savedAccounts, setSavedAccounts] = useState(EMPTY_PROVIDER_ACCOUNTS);
  const [authError, setAuthError] = useState("");
  const [authorizingMethod, setAuthorizingMethod] = useState("");
  const [googleDraft, setGoogleDraft] = useState({ displayName: "", email: "" });
  const [appleDraft, setAppleDraft] = useState({ displayName: "", email: "", hideEmail: true });
  const [emailMode, setEmailMode] = useState("signup");
  const [emailDraft, setEmailDraft] = useState({ displayName: "", email: "" });
  const [typedCopy, setTypedCopy] = useState("");
  const [typedLineIndex, setTypedLineIndex] = useState(0);
  const [typingMode, setTypingMode] = useState("typing");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const savedTheme = window.localStorage.getItem(SESSION_KEYS.theme);
    const savedMethod = window.localStorage.getItem(SESSION_KEYS.entryMethod);

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }

    if (savedMethod) {
      setHighlightedMethod(savedMethod);
    }

    setSavedAccounts(createSavedAccountState(window.localStorage));

    const timer = window.setTimeout(() => {
      setPhoneSheetRaised(true);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    const reason = typeof router.query.reason === "string" ? router.query.reason : "";
    const shouldOpenSheet = router.query.sheet === "1";

    setRedirectReason(reason);

    if (shouldOpenSheet) {
      setSheetView("methods");
      setSheetOpen(true);
    }
  }, [router.isReady, router.query.reason, router.query.sheet]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SESSION_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    const activeLine = MOBILE_TYPING_LINES[typedLineIndex];
    let timeoutId;

    if (typingMode === "typing") {
      if (typedCopy.length < activeLine.length) {
        timeoutId = window.setTimeout(() => {
          setTypedCopy(activeLine.slice(0, typedCopy.length + 1));
        }, 34);
      } else {
        timeoutId = window.setTimeout(() => {
          setTypingMode("holding");
        }, 1250);
      }
    } else if (typingMode === "holding") {
      timeoutId = window.setTimeout(() => {
        setTypingMode("deleting");
      }, 420);
    } else if (typedCopy.length > 0) {
      timeoutId = window.setTimeout(() => {
        setTypedCopy(activeLine.slice(0, typedCopy.length - 1));
      }, 16);
    } else {
      timeoutId = window.setTimeout(() => {
        setTypedLineIndex(currentIndex => (currentIndex + 1) % MOBILE_TYPING_LINES.length);
        setTypingMode("typing");
      }, 160);
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [typedCopy, typedLineIndex, typingMode]);

  const isAuthorizing = Boolean(authorizingMethod);
  const gateCopy = GATED_VIEW_COPY[redirectReason];

  const refreshSavedAccounts = () => {
    if (typeof window === "undefined") return;
    setSavedAccounts(createSavedAccountState(window.localStorage));
  };

  const closeSheet = () => {
    if (isAuthorizing) return;
    setSheetOpen(false);
    setSheetView("methods");
    setAuthError("");
  };

  const openMethodsSheet = () => {
    setSheetView("methods");
    setSheetOpen(true);
    setAuthError("");
  };

  const openMethodFlow = method => {
    setHighlightedMethod(method);
    setAuthError("");

    if (method === "guest") {
      void completeSession({
        entryMethod: "guest",
      });
      return;
    }

    if (method === "google" && savedAccounts.google[0]) {
      setGoogleDraft({
        displayName: savedAccounts.google[0].displayName || "",
        email: savedAccounts.google[0].email || "",
      });
    }

    if (method === "apple" && savedAccounts.apple[0]) {
      setAppleDraft(currentDraft => ({
        ...currentDraft,
        displayName: savedAccounts.apple[0].displayName || currentDraft.displayName,
        email: savedAccounts.apple[0].email || currentDraft.email,
      }));
    }

    if (method === "email" && savedAccounts.email[0]) {
      setEmailMode("login");
      setEmailDraft({
        displayName: savedAccounts.email[0].displayName || "",
        email: savedAccounts.email[0].email || "",
      });
    }

    setSheetView(method);
    setSheetOpen(true);
  };

  async function completeSession({ entryMethod, displayName, email, authMode = "login", hideEmail = false }) {
    if (typeof window === "undefined") return;

    const method = entryMethod || "guest";
    setAuthorizingMethod(method);
    setAuthError("");

    try {
      const sessionProfile = createSessionProfile({
        entryMethod: method,
        displayName,
        email,
        authMode,
        hideEmail,
      });

      if (method !== "guest") {
        saveProviderAccount(window.localStorage, method, sessionProfile);
      }

      saveSharePassSession(window.localStorage, sessionProfile);
      refreshSavedAccounts();

      if (method !== "guest") {
        await fetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionProfile,
          }),
        }).catch(() => null);
      }

      await new Promise(resolve => {
        window.setTimeout(resolve, 220);
      });

      await router.push("/app");
    } catch (error) {
      setAuthError(error.message || "Something slipped while preparing the session.");
    } finally {
      setAuthorizingMethod("");
    }
  }

  const handleGoogleCustomAccount = async event => {
    event.preventDefault();

    const nextDisplayName = googleDraft.displayName.trim();
    const nextEmail = googleDraft.email.trim().toLowerCase();

    if (!nextDisplayName) {
      setAuthError("Add a name for the Google account you want to use.");
      return;
    }

    if (!isValidEmail(nextEmail)) {
      setAuthError("Add a valid Google email address before continuing.");
      return;
    }

    await completeSession({
      entryMethod: "google",
      displayName: nextDisplayName,
      email: nextEmail,
    });
  };

  const handleAppleAuthorization = async event => {
    event.preventDefault();

    const nextDisplayName = appleDraft.displayName.trim();
    const nextEmail = appleDraft.email.trim().toLowerCase();

    if (!isValidEmail(nextEmail)) {
      setAuthError("Add a valid Apple ID email address before continuing.");
      return;
    }

    await completeSession({
      entryMethod: "apple",
      displayName: nextDisplayName || undefined,
      email: appleDraft.hideEmail ? createPrivateRelayEmail(nextEmail) : nextEmail,
      hideEmail: appleDraft.hideEmail,
    });
  };

  const handleEmailSubmit = async event => {
    event.preventDefault();

    const nextDisplayName = emailDraft.displayName.trim();
    const nextEmail = emailDraft.email.trim().toLowerCase();

    if (!isValidEmail(nextEmail)) {
      setAuthError("Add a valid email address before continuing.");
      return;
    }

    if (emailMode === "login") {
      const matchedAccount = savedAccounts.email.find(account => account.email === nextEmail);

      if (!matchedAccount) {
        setAuthError("No local email account was found for that address yet. Create one first.");
        return;
      }

      await completeSession({
        entryMethod: "email",
        displayName: matchedAccount.displayName,
        email: matchedAccount.email,
        authMode: "login",
      });
      return;
    }

    if (!nextDisplayName) {
      setAuthError("Add a display name so the email account can be created.");
      return;
    }

    if (savedAccounts.email.some(account => account.email === nextEmail)) {
      setAuthError("That email already exists on this device. Switch to sign in instead.");
      return;
    }

    await completeSession({
      entryMethod: "email",
      displayName: nextDisplayName,
      email: nextEmail,
      authMode: "signup",
    });
  };

  const renderMethodsSheet = () => (
    <>
      <div className="entry-auth-sheet-top">
        <div>
          <div className="section-pill entry-sheet-pill">
            <Icon.Rise />
            Slide Up To Enter
          </div>
          <h2 className="entry-auth-title">Choose how you want to sign in.</h2>
          <p className="entry-auth-sub">
            Guest entry gets you into Feed, Express, and AI Assist quickly. Signed-in sessions unlock profile access,
            circles, and a more persistent SharePass path.
          </p>
        </div>

        <button className="entry-sheet-close" type="button" onClick={closeSheet} aria-label="Close sign-in sheet">
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
            onClick={() => openMethodFlow(id)}
            disabled={isAuthorizing}
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
          <span>Guest mode stays lightweight on purpose. Signed-in mode is where profile, circles, and future account features open up.</span>
        </div>
      </div>
    </>
  );

  const renderProviderHeader = (pillIcon, pillText, title, description) => (
    <>
      <div className="entry-provider-header">
        <button className="entry-sheet-back" type="button" onClick={() => setSheetView("methods")} disabled={isAuthorizing}>
          <Icon.Back />
          Back
        </button>

        <button className="entry-sheet-close" type="button" onClick={closeSheet} aria-label="Close sign-in sheet">
          <Icon.Close />
        </button>
      </div>

      <div className="section-pill entry-sheet-pill entry-provider-pill">
        {pillIcon}
        {pillText}
      </div>
      <h2 className="entry-auth-title">{title}</h2>
      <p className="entry-auth-sub">{description}</p>
    </>
  );

  const renderGoogleSheet = () => (
    <div className="entry-provider-shell">
      {renderProviderHeader(
        <Icon.Google />,
        "Google Authorization",
        "Choose a Google account",
        hasRealGoogleOAuth
          ? "Use Google's real account chooser for verified sign-in and let SharePass create the local session after Google confirms the account."
          : "Select a remembered Google account or add another one, then we authorize it locally and move you into the app.",
      )}

      {hasRealGoogleOAuth && (
        <div className="entry-provider-block">
          <div className="entry-provider-block-head">
            <h3>Real Google sign-in</h3>
            <span>Recommended</span>
          </div>
          <div className="entry-empty-note" style={{ marginBottom: 12 }}>
            This uses Google&apos;s account chooser and verified email flow instead of a local-only mock session.
          </div>
          <button
            className="sp-btn sp-btn-primary"
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/api/auth/google/start";
              }
            }}
            disabled={isAuthorizing}
          >
            Continue With Real Google
          </button>
        </div>
      )}

      {!hasRealGoogleOAuth && savedAccounts.google.length > 0 ? (
        <div className="entry-provider-block">
          <div className="entry-provider-block-head">
            <h3>Remembered Google accounts</h3>
            <span>Select one</span>
          </div>
          <div className="entry-account-list">
            {savedAccounts.google.map(account => (
              <RememberedAccountButton
                key={`${account.email}-${account.createdAt}`}
                account={account}
                actionLabel={authorizingMethod === "google" ? "Authorizing..." : "Authorize"}
                onClick={() => {
                  void completeSession({
                    entryMethod: "google",
                    displayName: account.displayName,
                    email: account.email,
                    authMode: "login",
                  });
                }}
                disabled={isAuthorizing}
              />
            ))}
          </div>
        </div>
      ) : !hasRealGoogleOAuth ? (
        <div className="entry-empty-note">
          No Google account is remembered on this device yet. Add one below and it will show up here next time.
        </div>
      ) : null}

      {!hasRealGoogleOAuth && (
        <form className="entry-provider-form" onSubmit={handleGoogleCustomAccount}>
          <div className="entry-provider-block-head">
            <h3>Use another Google account</h3>
            <span>Add and authorize</span>
          </div>

          <label className="entry-form-field">
            <span>Name</span>
            <input
              type="text"
              placeholder="Your name"
              value={googleDraft.displayName}
              onChange={event => setGoogleDraft(currentDraft => ({ ...currentDraft, displayName: event.target.value }))}
            />
          </label>

          <label className="entry-form-field">
            <span>Google email</span>
            <input
              type="email"
              placeholder="you@gmail.com"
              value={googleDraft.email}
              onChange={event => setGoogleDraft(currentDraft => ({ ...currentDraft, email: event.target.value }))}
            />
          </label>

          <button className="entry-primary-btn entry-provider-submit" type="submit" disabled={isAuthorizing}>
            {authorizingMethod === "google" ? "Authorizing Google..." : "Authorize Google"}
          </button>
        </form>
      )}
    </div>
  );

  const renderAppleSheet = () => (
    <div className="entry-provider-shell">
      {renderProviderHeader(
        <Icon.Apple />,
        "Apple Authorization",
        "Continue with Apple",
        "Apple sign-in keeps the flow quiet. You can keep your email visible or swap it for a private relay style alias here.",
      )}

      {savedAccounts.apple.length > 0 && (
        <div className="entry-provider-block">
          <div className="entry-provider-block-head">
            <h3>Remembered Apple accounts</h3>
            <span>Select one</span>
          </div>
          <div className="entry-account-list">
            {savedAccounts.apple.map(account => (
              <RememberedAccountButton
                key={`${account.email}-${account.createdAt}`}
                account={account}
                actionLabel={authorizingMethod === "apple" ? "Authorizing..." : "Authorize"}
                onClick={() => {
                  void completeSession({
                    entryMethod: "apple",
                    displayName: account.displayName,
                    email: account.email,
                    authMode: "login",
                    hideEmail: account.hideEmail,
                  });
                }}
                disabled={isAuthorizing}
              />
            ))}
          </div>
        </div>
      )}

      <form className="entry-provider-form" onSubmit={handleAppleAuthorization}>
        <div className="entry-provider-block-head">
          <h3>Authorize a new Apple ID</h3>
          <span>Private by default</span>
        </div>

        <label className="entry-form-field">
          <span>Name</span>
          <input
            type="text"
            placeholder="Your name"
            value={appleDraft.displayName}
            onChange={event => setAppleDraft(currentDraft => ({ ...currentDraft, displayName: event.target.value }))}
          />
        </label>

        <label className="entry-form-field">
          <span>Apple ID email</span>
          <input
            type="email"
            placeholder="you@icloud.com"
            value={appleDraft.email}
            onChange={event => setAppleDraft(currentDraft => ({ ...currentDraft, email: event.target.value }))}
          />
        </label>

        <button
          className={`entry-privacy-toggle ${appleDraft.hideEmail ? "active" : ""}`}
          type="button"
          onClick={() => setAppleDraft(currentDraft => ({ ...currentDraft, hideEmail: !currentDraft.hideEmail }))}
        >
          <span className="entry-privacy-toggle-copy">
            <strong>Hide my email</strong>
            <span>{appleDraft.hideEmail ? "Private relay alias will be used for the session." : "Your Apple email will stay visible in this local account."}</span>
          </span>
          <span className="entry-privacy-toggle-state">{appleDraft.hideEmail ? "On" : "Off"}</span>
        </button>

        <button className="entry-primary-btn entry-provider-submit" type="submit" disabled={isAuthorizing}>
          {authorizingMethod === "apple" ? "Authorizing Apple..." : "Authorize Apple"}
        </button>
      </form>
    </div>
  );

  const renderEmailSheet = () => (
    <div className="entry-provider-shell">
      {renderProviderHeader(
        <Icon.Mail />,
        "Email Entry",
        "Sign in or create with email",
        "Email gets its own flow here. Sign in to a remembered account on this device, or create a new one and enter right away.",
      )}

      <div className="entry-auth-tabs" role="tablist" aria-label="Choose email flow">
        <button
          className={`entry-auth-tab ${emailMode === "signup" ? "active" : ""}`}
          type="button"
          onClick={() => {
            setEmailMode("signup");
            setAuthError("");
          }}
        >
          Create account
        </button>
        <button
          className={`entry-auth-tab ${emailMode === "login" ? "active" : ""}`}
          type="button"
          onClick={() => {
            setEmailMode("login");
            setAuthError("");
          }}
        >
          Sign in
        </button>
      </div>

      {emailMode === "login" && savedAccounts.email.length > 0 ? (
        <div className="entry-provider-block">
          <div className="entry-provider-block-head">
            <h3>Remembered email accounts</h3>
            <span>Select one</span>
          </div>
          <div className="entry-account-list">
            {savedAccounts.email.map(account => (
              <RememberedAccountButton
                key={`${account.email}-${account.createdAt}`}
                account={account}
                actionLabel={authorizingMethod === "email" ? "Signing in..." : "Sign in"}
                onClick={() => {
                  void completeSession({
                    entryMethod: "email",
                    displayName: account.displayName,
                    email: account.email,
                    authMode: "login",
                  });
                }}
                disabled={isAuthorizing}
              />
            ))}
          </div>
        </div>
      ) : null}

      {emailMode === "login" && savedAccounts.email.length === 0 ? (
        <div className="entry-empty-note">
          No email account is saved on this device yet. Create one first, then signing in here will work like a remembered return.
        </div>
      ) : null}

      <form className="entry-provider-form" onSubmit={handleEmailSubmit}>
        <div className="entry-provider-block-head">
          <h3>{emailMode === "signup" ? "Create your email account" : "Sign in with email"}</h3>
          <span>{emailMode === "signup" ? "Local account creation" : "Device-based sign-in"}</span>
        </div>

        {emailMode === "signup" ? (
          <label className="entry-form-field">
            <span>Name</span>
            <input
              type="text"
              placeholder="Your name"
              value={emailDraft.displayName}
              onChange={event => setEmailDraft(currentDraft => ({ ...currentDraft, displayName: event.target.value }))}
            />
          </label>
        ) : null}

        <label className="entry-form-field">
          <span>Email</span>
          <input
            type="email"
            placeholder="you@example.com"
            value={emailDraft.email}
            onChange={event => setEmailDraft(currentDraft => ({ ...currentDraft, email: event.target.value }))}
          />
        </label>

        <button className="entry-primary-btn entry-provider-submit" type="submit" disabled={isAuthorizing}>
          {authorizingMethod === "email"
            ? emailMode === "signup" ? "Creating account..." : "Signing in..."
            : emailMode === "signup" ? "Create Email Account" : "Continue With Email"}
        </button>
      </form>
    </div>
  );

  const currentProviderLabel = AUTH_OPTIONS.find(option => option.id === highlightedMethod)?.label || "Choose a sign-in path";

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
              <Icon.Logo theme={theme} size={36} />
            </div>
            <div className="entry-brand-copy">
              <span className="entry-brand-name">SharePass</span>
              <span className="entry-brand-tag">Emotional support system</span>
            </div>
          </div>

          <div className="section-pill">
            <Icon.Privacy />
            Private-First Entry
          </div>

          <h1 className="entry-title">A softer front door for anonymous support and calmer conversations.</h1>
          <p className="entry-lead">
            SharePass is designed for people who need somewhere gentle to unload, reflect, and feel a little less
            alone. Anonymous mode keeps the first step easy. Signing in now has provider-specific flows for Google,
            Apple, and email before you enter.
          </p>

          <div className="entry-mobile-type-card" aria-hidden="true">
            <span className="entry-mobile-type-kicker">One-screen mobile intro</span>
            <div className="entry-mobile-type-line">
              <span>{typedCopy}</span>
              <span className="entry-mobile-type-caret" />
            </div>
          </div>

          {gateCopy && (
            <div className="entry-context-note">
              <strong>{gateCopy.title}</strong>
              <span>{gateCopy.body}</span>
            </div>
          )}

          <div className="entry-story-grid">
            {PLATFORM_PANELS.map(panel => (
              <article key={panel.title} className="entry-story-card">
                <h2>{panel.title}</h2>
                <p>{panel.body}</p>
              </article>
            ))}
          </div>

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
            <button className="entry-primary-btn" type="button" onClick={openMethodsSheet}>
              Open Sign-In Sheet
              <Icon.Rise />
            </button>
            <button className="entry-secondary-btn" type="button" onClick={() => openMethodFlow("guest")}>
              Continue Anonymously
            </button>
          </div>

          <div className="entry-trust-note">
            <Icon.Shield />
            <span>Your in-app identity still stays protected after entry.</span>
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
                  <strong>Select an account, authorize it, then move softly into the app.</strong>
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
                    <h2>{currentProviderLabel}</h2>
                  </div>
                  <button className="entry-mini-open" type="button" onClick={openMethodsSheet}>
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
                      onClick={() => openMethodFlow(id)}
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

      <div className="entry-mobile-launch">
        <button className="entry-mobile-launch-btn" type="button" onClick={openMethodsSheet}>
          Sign in to start
          <Icon.Rise />
        </button>
      </div>

      <div
        className={`entry-sheet-backdrop ${sheetOpen ? "open" : ""}`}
        onClick={closeSheet}
        aria-hidden={!sheetOpen}
      />

      <aside className={`entry-auth-sheet ${sheetOpen ? "open" : ""}`}>
        <div className="entry-sheet-handle" />

        {sheetView === "methods" && renderMethodsSheet()}
        {sheetView === "google" && renderGoogleSheet()}
        {sheetView === "apple" && renderAppleSheet()}
        {sheetView === "email" && renderEmailSheet()}

        {authError && <div className="entry-inline-error">{authError}</div>}
      </aside>
    </div>
  );
}
