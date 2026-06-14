// Shared progress/streak helpers used by the student dashboard and admin analytics.

// Local day key (year-month-day) for grouping by calendar day.
export function dayKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

// Consecutive-day streak ending today (or yesterday) from a set of day keys.
export function computeStreak(daysSet) {
  if (daysSet.size === 0) return 0;
  const key = (dt) => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
  const now = new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!daysSet.has(key(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!daysSet.has(key(cursor))) return 0; // nothing today or yesterday
  }
  let streak = 0;
  while (daysSet.has(key(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Short relative-time label, e.g. "5m ago", "3h ago", "2d ago".
export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
