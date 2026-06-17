// Auth helpers shared by Login and Signup: email validation and
// human-friendly mapping of Supabase auth error codes/messages.

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

// Supabase's signUp does NOT throw when the email already exists (anti-account-
// enumeration). Instead it returns a user object with an EMPTY identities array.
// Detect that so we can route the user to sign in instead.
export function isExistingUserSignup(data) {
  const identities = data?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

// True when an explicit Supabase error means the account already exists.
export function isAlreadyRegisteredError(error) {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return error.code === "user_already_exists" || msg.includes("already registered") || msg.includes("already been registered");
}

// Map a Supabase auth error to a clear, friendly sentence. Supabase v2 errors
// carry a stable `code` plus a `message`; we match on code first, then fall
// back to message text for older/edge cases.
export function friendlyAuthError(error) {
  if (!error) return "";
  const code = error.code || "";
  const msg = (error.message || "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the link.";
  }
  if (
    code === "user_already_exists" ||
    msg.includes("already registered") ||
    msg.includes("already been registered")
  ) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (code === "weak_password" || msg.includes("password should be") || msg.includes("weak password")) {
    return "That password is too weak. Use at least 8 characters with a mix of letters and numbers.";
  }
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    code === "validation_failed" ||
    msg.includes("unable to validate email") ||
    msg.includes("invalid email") ||
    msg.includes("invalid format")
  ) {
    return "That email address doesn't look valid. Please check it.";
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "Network error. Check your connection and try again.";
  }
  // Last resort: surface the raw message so nothing is silently swallowed.
  return error.message || "Something went wrong. Please try again.";
}
