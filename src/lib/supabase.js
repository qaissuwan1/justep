// Supabase client singleton, configured from Vite env vars.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev so a missing .env is obvious rather than a silent auth failure.
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file.");
}

// ---------------------------------------------------------------------------
// "Remember me" persistence
// ---------------------------------------------------------------------------
// Two layers cooperate so this works for BOTH email/password and Google OAuth:
//
//   1. A storage adapter routes the session token to localStorage (persists
//      across browser restarts) or sessionStorage (cleared on browser close),
//      based on the resolved "remember me" preference.
//
//   2. After every auth state change we re-assert that preference and move the
//      session into the correct store. The OAuth redirect can persist the
//      session before the adapter's preference is known, so this reconciliation
//      is what actually makes OAuth respect the checkbox — in BOTH directions
//      (pull a remembered session back into localStorage; push a non-remembered
//      one into sessionStorage).
//
// The preference is mirrored into a short-lived cookie because the redirect can
// race with / reset localStorage; cookies survive the round-trip reliably.
const REMEMBER_KEY = "ju-remember-me";
const AUTH_TOKEN_RE = /^sb-.*-auth-token$/; // Supabase's per-project token keys

function readCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value) {
  // max-age covers the OAuth round-trip; SameSite=Lax keeps it across the
  // top-level redirect back from Google.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=600; SameSite=Lax`;
}

function clearCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

// Resolve the preference from BOTH sources — either saying "true" wins, so a
// remembered session survives even if one store was cleared by the redirect.
function readRememberPreference() {
  const ls = localStorage.getItem(REMEMBER_KEY);
  const cookie = readCookie(REMEMBER_KEY);
  return { ls, cookie, remember: ls === "true" || cookie === "true" };
}

function activeStorage() {
  return readRememberPreference().remember ? localStorage : sessionStorage;
}

// Keeps the token in exactly one store (the active one) but reads from either,
// so an existing session is always found.
const hybridStorage = {
  getItem: (key) => sessionStorage.getItem(key) ?? localStorage.getItem(key),
  setItem: (key, value) => {
    const store = activeStorage();
    const other = store === localStorage ? sessionStorage : localStorage;
    other.removeItem(key); // avoid a stale copy lingering in the inactive store
    store.setItem(key, value);
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export function setRememberMe(remember) {
  const value = remember ? "true" : "false";
  console.log("[auth] setRememberMe:", value);
  // Stored in localStorage AND a cookie so the choice survives the OAuth
  // redirect even if localStorage is reset along the way.
  localStorage.setItem(REMEMBER_KEY, value);
  writeCookie(REMEMBER_KEY, value);
}

// Re-assert the remember preference against the persisted session and relocate
// the token to the correct store. Runs on every auth state change, covering
// email/password and the OAuth redirect alike.
function enforceRememberPreference() {
  const { ls, cookie, remember } = readRememberPreference();
  console.log(
    `[auth] enforceRememberPreference — localStorage="${ls}" cookie="${cookie}" => remember=${remember}`
  );

  const from = remember ? sessionStorage : localStorage; // where it shouldn't be
  const to = remember ? localStorage : sessionStorage; // where it belongs
  let moved = 0;

  for (const key of Object.keys(from)) {
    if (!AUTH_TOKEN_RE.test(key)) continue;
    const value = from.getItem(key);
    if (value === null) continue;
    console.log(`[auth] moving ${key} -> ${remember ? "localStorage" : "sessionStorage"}`);
    to.setItem(key, value);
    from.removeItem(key);
    moved++;
  }
  if (moved === 0) {
    console.log(`[auth] session already in the correct store (${remember ? "localStorage" : "sessionStorage"}), leaving it`);
  }

  // Persist the resolved preference back to localStorage so later reads (token
  // refresh, next page load) stay correct, then consume the one-time cookie.
  localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
  if (cookie !== null) {
    console.log("[auth] clearing ju-remember-me cookie (one-time use)");
    clearCookie(REMEMBER_KEY);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: hybridStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Registered once at module load so it covers every sign-in — email/password
// and Google OAuth — regardless of which route the user lands on afterward.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
    enforceRememberPreference();
  }
});
