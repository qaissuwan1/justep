// Guided "Study Session" state — walks the dashboard study queue as one
// connected journey (task → task → done). Persisted in sessionStorage so it's
// per-browser-session, keyed per user + day:  active_session_<userId>_<YYYY-MM-DD>.
import { supabase } from "./supabase";

function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function sessionKey(userId) {
  return `active_session_${userId}_${todayKey()}`;
}

export function readSession(userId) {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(sessionKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSession(userId, session) {
  if (!userId) return;
  try {
    sessionStorage.setItem(sessionKey(userId), JSON.stringify(session));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export function clearSession(userId) {
  if (!userId) return;
  try {
    sessionStorage.removeItem(sessionKey(userId));
  } catch {
    /* ignore */
  }
}

// Capture the ordered queue as a fresh session at index 0.
export function startSession(userId, tasks) {
  const session = { tasks: Array.isArray(tasks) ? tasks : [], currentIndex: 0, startedAt: new Date().toISOString() };
  writeSession(userId, session);
  return session;
}

// Move to the next task. Returns { session, done, nextTask }.
//   session === null → there was no active session.
//   done === true    → no tasks remain (currentIndex left at the last task).
export function advanceSession(userId) {
  const s = readSession(userId);
  if (!s) return { session: null, done: true, nextTask: null };
  const total = s.tasks?.length || 0;
  const nextIndex = (s.currentIndex ?? 0) + 1;
  if (nextIndex >= total) return { session: s, done: true, nextTask: null };
  const updated = { ...s, currentIndex: nextIndex };
  writeSession(userId, updated);
  return { session: updated, done: false, nextTask: updated.tasks[nextIndex] };
}

// True when there's an in-progress session for today (more tasks remain).
export function isResumable(session) {
  return !!session && (session.currentIndex ?? 0) < (session.tasks?.length || 0);
}

// Base deep-link for a queue task (mirrors Phase A). When inSession, append session=1.
function baseRouteFor(task) {
  switch (task?.item_type) {
    case "WRONG_QUESTION":
      return "/app/questions?mode=incorrect";
    case "FLASHCARD_DUE":
      return "/app/flashcards?mode=due";
    case "LECTURE_UNFINISHED":
      return task.ref_id ? `/app/subjects?lecture=${task.ref_id}` : "/app/subjects";
    default:
      return "/app/questions"; // RECOMMENDED → normal setup
  }
}

export function taskRoute(task, inSession) {
  const base = baseRouteFor(task);
  if (!inSession) return base;
  return base + (base.includes("?") ? "&" : "?") + "session=1";
}

// Human label per task type, for the completion-screen breakdown.
export function taskLabel(type) {
  switch (type) {
    case "WRONG_QUESTION":
      return "Reviewed wrong questions";
    case "FLASHCARD_DUE":
      return "Reviewed flashcards";
    case "LECTURE_UNFINISHED":
      return "Continued a lecture";
    case "RECOMMENDED":
      return "Practiced recommended questions";
    default:
      return "Studied";
  }
}

export async function currentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id || null;
}

// Advance + navigate. Called by each task page's "Next task →" button.
export async function goToNextTask(navigate) {
  const uid = await currentUserId();
  if (!uid) {
    navigate("/app/home");
    return;
  }
  const { session, done, nextTask } = advanceSession(uid);
  if (!session) {
    navigate("/app/home"); // no active session — bail to dashboard
    return;
  }
  if (done || !nextTask) navigate("/app/home?session=complete");
  else navigate(taskRoute(nextTask, true));
}
