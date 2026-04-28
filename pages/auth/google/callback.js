import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  createSessionProfile,
  saveProviderAccount,
  saveSharePassSession,
} from "../../../lib/sharepass-session";
import {
  exchangeGoogleCode,
  isGoogleOAuthConfigured,
  resolveRequestOrigin,
} from "../../../lib/sharepass-google-auth";
import {
  buildAdminSessionCookie,
  buildClearedAdminSessionCookie,
} from "../../../lib/sharepass-admin-session";
import { isAdminEmail } from "../../../lib/sharepass-server-store";

function clearStateCookie(origin) {
  const isSecure = origin.startsWith("https://");

  return [
    "sharepass_google_state=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    isSecure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function setCallbackCookies({ context, origin, email }) {
  const isSecure = origin.startsWith("https://");
  const cookies = [
    clearStateCookie(origin),
    buildClearedAdminSessionCookie({ secure: isSecure }),
  ];

  if (isAdminEmail(email)) {
    const adminSessionCookie = buildAdminSessionCookie({ email, secure: isSecure });
    if (adminSessionCookie) {
      cookies.push(adminSessionCookie);
    }
  }

  context.res.setHeader("Set-Cookie", cookies);
}

export async function getServerSideProps(context) {
  let origin;
  try {
    origin = resolveRequestOrigin(context.req);
  } catch {
    return {
      props: {
        error: "Google sign-in origin is invalid. Check APP_URL or proxy host settings and try again.",
      },
    };
  }

  setCallbackCookies({ context, origin, email: "" });

  if (!isGoogleOAuthConfigured()) {
    return {
      props: {
        error: "Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.",
      },
    };
  }

  const { code, state, error: googleError } = context.query;
  const stateCookie = String(context.req.cookies?.sharepass_google_state || "");

  if (googleError) {
    return {
      props: {
        error: "Google sign-in was cancelled before it finished.",
      },
    };
  }

  if (!code || !state || String(state) !== stateCookie) {
    return {
      props: {
        error: "Google sign-in state could not be verified. Please try again.",
      },
    };
  }

  try {
    const googleProfile = await exchangeGoogleCode({
      code: String(code),
      origin,
    });

    if (!googleProfile.emailVerified) {
      return {
        props: {
          error: "Google returned an email that has not been verified yet.",
        },
      };
    }

    setCallbackCookies({ context, origin, email: googleProfile.email });

    return {
      props: {
        googleProfile,
      },
    };
  } catch (callbackError) {
    return {
      props: {
        error: callbackError.message || "Google sign-in could not be completed right now.",
      },
    };
  }
}

export default function GoogleCallbackPage({ googleProfile, error }) {
  const router = useRouter();
  const [message, setMessage] = useState("Finalizing your Google sign-in…");

  useEffect(() => {
    if (typeof window === "undefined" || !googleProfile || error) {
      return undefined;
    }

    let active = true;

    const finishGoogleSignIn = async () => {
      try {
        const sessionProfile = createSessionProfile({
          entryMethod: "google",
          displayName: googleProfile.displayName,
          email: googleProfile.email,
          avatarLabel: googleProfile.avatarLabel,
          authMode: "login",
        });

        saveProviderAccount(window.localStorage, "google", sessionProfile);
        saveSharePassSession(window.localStorage, sessionProfile);

        await fetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionProfile,
          }),
        }).catch(() => null);

        if (active) {
          setMessage("Google sign-in is ready. Taking you into SharePass…");
        }

        await router.replace("/app");
      } catch (clientError) {
        if (active) {
          setMessage(clientError.message || "Google sign-in finished, but the session could not be saved locally.");
        }
      }
    };

    void finishGoogleSignIn();

    return () => {
      active = false;
    };
  }, [error, googleProfile, router]);

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px",
      background: "#0c121a",
      color: "#f4f7fb",
      fontFamily: "Onest, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
        padding: "24px",
        borderRadius: "24px",
        background: "rgba(255,255,255,0.04)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
      }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "24px" }}>Google Sign-In</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: "rgba(244,247,251,0.78)" }}>
          {error || message}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => router.replace("/?sheet=1")}
            style={{
              marginTop: "18px",
              minHeight: "44px",
              padding: "0 16px",
              borderRadius: "14px",
              border: "none",
              background: "#c4a882",
              color: "#10161f",
              cursor: "pointer",
              fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            Back To Login
          </button>
        )}
      </div>
    </main>
  );
}
