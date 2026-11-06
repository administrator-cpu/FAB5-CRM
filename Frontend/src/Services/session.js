// Ends the session on the client when the login token is no longer valid: clears what the app
// stored at login and goes to the login page, which then says the session expired.

const EXPIRED_FLAG = "session_expired";
let expiring = false;

// True when this browser holds a session (stored at login), so a 401 means it has ended.
export const hasStoredSession = () =>
  Boolean(localStorage.getItem("token") || sessionStorage.getItem("user_profile"));

export const expireSession = () => {
  if (expiring) return;
  expiring = true;
  localStorage.removeItem("token");
  sessionStorage.removeItem("user_profile");
  sessionStorage.setItem(EXPIRED_FLAG, "1");
  window.location.replace("/auth/login");
};

// Read once on the next page load: true if the last session was ended because it expired.
export const consumeExpiredFlag = () => {
  const expired = sessionStorage.getItem(EXPIRED_FLAG) === "1";
  sessionStorage.removeItem(EXPIRED_FLAG);
  return expired;
};

// Milliseconds until the stored JWT expires (from its exp claim); null if there's no readable token.
export const msUntilTokenExpiry = () => {
  const token = localStorage.getItem("token");
  if (!token || token === "undefined") return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 - Date.now() : null;
  } catch {
    return null;
  }
};
