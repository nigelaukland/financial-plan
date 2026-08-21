// Thin async wrapper around localStorage, matching the {get, set} shape
// the component was originally written against (window.storage).
export const storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value === null ? null : { value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
  },
};
