import { createAnonymousUsername } from "./sharepass-data";

export const SESSION_KEYS = {
  entryMethod: "sharepass.entryMethod",
  username: "sharepass.username",
  theme: "sharepass.theme",
  privacy: "sharepass.privacy",
  account: "sharepass.account",
  providerAccounts: "sharepass.providerAccounts",
  mood: "sharepass.mood",
  circles: "sharepass.circles",
  activeCircle: "sharepass.activeCircle",
  superAdmins: "sharepass.superAdmins",
};

export const GATED_VIEWS = new Set(["circles", "profile"]);

const EMPTY_PROVIDER_ACCOUNTS = {
  google: [],
  apple: [],
  email: [],
};

const MAX_SAVED_PROVIDER_ACCOUNTS = 5;

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

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseEmailList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function createDisplayNameFromEmail(email) {
  const localPart = cleanString(email).split("@")[0];

  if (!localPart) {
    return "";
  }

  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeAccount(entryMethod, draft = {}) {
  const email = cleanString(draft.email).toLowerCase();
  const displayName = cleanString(draft.displayName)
    || cleanString(draft.username)
    || createDisplayNameFromEmail(email)
    || (isGuestEntry(entryMethod) ? `Guest ${createAnonymousUsername()}` : createAnonymousUsername());

  return {
    entryMethod,
    username: displayName,
    displayName,
    email,
    avatarLabel: cleanString(draft.avatarLabel) || displayName.charAt(0).toUpperCase() || "S",
    authMode: cleanString(draft.authMode) || (entryMethod === "email" ? "signup" : "login"),
    hideEmail: Boolean(draft.hideEmail),
    createdAt: cleanString(draft.createdAt) || new Date().toISOString(),
  };
}

export function createSessionUsername(entryMethod) {
  return normalizeAccount(entryMethod).username;
}

export function createSessionProfile({ entryMethod, ...draft }) {
  return normalizeAccount(entryMethod || "guest", draft);
}

export function getSharePassSession(storage) {
  if (!storage) return null;

  const entryMethod = storage.getItem(SESSION_KEYS.entryMethod);

  if (!entryMethod) {
    return null;
  }

  const legacyUsername = cleanString(storage.getItem(SESSION_KEYS.username));
  const rawAccount = storage.getItem(SESSION_KEYS.account);

  if (!rawAccount) {
    return createSessionProfile({
      entryMethod,
      displayName: legacyUsername || undefined,
    });
  }

  try {
    const parsedAccount = JSON.parse(rawAccount);

    return normalizeAccount(entryMethod, {
      ...parsedAccount,
      displayName: parsedAccount?.displayName || legacyUsername || parsedAccount?.username,
    });
  } catch {
    return createSessionProfile({
      entryMethod,
      displayName: legacyUsername || undefined,
    });
  }
}

export function saveSharePassSession(storage, sessionProfile) {
  if (!storage || !sessionProfile?.entryMethod) {
    return null;
  }

  const normalizedProfile = normalizeAccount(sessionProfile.entryMethod, sessionProfile);

  storage.setItem(SESSION_KEYS.entryMethod, normalizedProfile.entryMethod);
  storage.setItem(SESSION_KEYS.username, normalizedProfile.username);

  if (isGuestEntry(normalizedProfile.entryMethod)) {
    storage.removeItem(SESSION_KEYS.account);
    return normalizedProfile;
  }

  storage.setItem(SESSION_KEYS.account, JSON.stringify(normalizedProfile));
  return normalizedProfile;
}

export function readSavedProviderAccounts(storage) {
  if (!storage) {
    return EMPTY_PROVIDER_ACCOUNTS;
  }

  const rawAccounts = storage.getItem(SESSION_KEYS.providerAccounts);

  if (!rawAccounts) {
    return EMPTY_PROVIDER_ACCOUNTS;
  }

  try {
    const parsedAccounts = JSON.parse(rawAccounts);

    return {
      google: Array.isArray(parsedAccounts?.google) ? parsedAccounts.google : [],
      apple: Array.isArray(parsedAccounts?.apple) ? parsedAccounts.apple : [],
      email: Array.isArray(parsedAccounts?.email) ? parsedAccounts.email : [],
    };
  } catch {
    return EMPTY_PROVIDER_ACCOUNTS;
  }
}

export function getSavedProviderAccounts(storage, entryMethod) {
  return readSavedProviderAccounts(storage)[entryMethod] || [];
}

export function saveProviderAccount(storage, entryMethod, account) {
  if (!storage || isGuestEntry(entryMethod) || !entryMethod) {
    return [];
  }

  const normalizedAccount = normalizeAccount(entryMethod, account);
  const currentAccounts = readSavedProviderAccounts(storage);
  const nextAccounts = [
    normalizedAccount,
    ...currentAccounts[entryMethod].filter(savedAccount => savedAccount.email !== normalizedAccount.email),
  ].slice(0, MAX_SAVED_PROVIDER_ACCOUNTS);

  storage.setItem(
    SESSION_KEYS.providerAccounts,
    JSON.stringify({
      ...EMPTY_PROVIDER_ACCOUNTS,
      ...currentAccounts,
      [entryMethod]: nextAccounts,
    }),
  );

  return nextAccounts;
}

export function getConfiguredSuperAdminEmails() {
  return parseEmailList(process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS);
}

export function getStoredSuperAdminEmails(storage) {
  if (!storage) {
    return [];
  }

  const rawValue = storage.getItem(SESSION_KEYS.superAdmins);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(item => cleanString(item).toLowerCase())
      .filter(Boolean);
  } catch {
    return parseEmailList(rawValue);
  }
}

export function ensureSuperAdminEmails(storage, sessionProfile) {
  const configuredEmails = getConfiguredSuperAdminEmails();

  if (configuredEmails.length > 0) {
    return configuredEmails;
  }

  const storedEmails = getStoredSuperAdminEmails(storage);

  if (storedEmails.length > 0 || !storage) {
    return storedEmails;
  }

  const sessionEmail = cleanString(sessionProfile?.email).toLowerCase();

  if (!sessionEmail) {
    return [];
  }

  storage.setItem(SESSION_KEYS.superAdmins, JSON.stringify([sessionEmail]));
  return [sessionEmail];
}

export function isSuperAdminSession(storage, sessionProfile) {
  const sessionEmail = cleanString(sessionProfile?.email).toLowerCase();

  if (!sessionEmail) {
    return false;
  }

  return ensureSuperAdminEmails(storage, sessionProfile).includes(sessionEmail);
}

export function clearSharePassSession(storage) {
  if (!storage) return;

  storage.removeItem(SESSION_KEYS.entryMethod);
  storage.removeItem(SESSION_KEYS.username);
  storage.removeItem(SESSION_KEYS.privacy);
  storage.removeItem(SESSION_KEYS.account);
  storage.removeItem(SESSION_KEYS.mood);
  storage.removeItem(SESSION_KEYS.circles);
  storage.removeItem(SESSION_KEYS.activeCircle);
}
