import { createAnonymousUsername } from "./sharepass-data";

export const SESSION_KEYS = {
  entryMethod: "sharepass.entryMethod",
  username: "sharepass.username",
  theme: "sharepass.theme",
  privacy: "sharepass.privacy",
};

export const GATED_VIEWS = new Set(["circles", "profile"]);

export const GATED_VIEW_COPY = {
  circles: {
    title: "Join circles after sign-in",
    body: "Support circles, saved participation, and future group features are reserved for signed-in sessions.",
  },
  profile: {
    title: "Unlock your full profile",
    body: "Signed-in sessions get profile controls, saved preferences, and a more persistent identity.",
  },
};

export function getSessionMethodLabel(entryMethod) {
  if (entryMethod === "google") return "Signed in with Google";
  if (entryMethod === "apple") return "Signed in with Apple";
  if (entryMethod === "email") return "Signed in with Email";
  return "Anonymous session";
}

export function isGuestEntry(entryMethod) {
  return !entryMethod || entryMethod === "guest";
}

export function createSessionUsername(entryMethod) {
  if (isGuestEntry(entryMethod)) {
    return `Guest ${createAnonymousUsername()}`;
  }

  return createAnonymousUsername();
}

export function clearSharePassSession(storage) {
  if (!storage) return;

  storage.removeItem(SESSION_KEYS.entryMethod);
  storage.removeItem(SESSION_KEYS.username);
  storage.removeItem(SESSION_KEYS.privacy);
}
