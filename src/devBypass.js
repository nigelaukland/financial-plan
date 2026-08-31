// Opt-in dev-only auth bypass. Requires BOTH import.meta.env.DEV (never true
// in a production build) and an explicit local env flag, so `npm run dev`
// doesn't silently skip sign-in unless you've asked for it.
export const DEV_BYPASS_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

export const DEV_BYPASS_EMAIL = "dev-bypass@localhost";
