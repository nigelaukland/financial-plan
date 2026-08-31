// Supabase-backed replacement for the old localStorage-only wrapper, keeping
// the same {get, set} shape the component was originally written against.
// Data is a single shared household row per key (see plan_data schema) —
// either signed-in account can read/write all of it.
import { supabase } from "./supabaseClient";
import { DEV_BYPASS_AUTH } from "./devBypass";

// One-time fallback: if Supabase has no row yet for a key but this browser's
// localStorage does (pre-migration data), adopt it and push it up once.
async function migrateFromLocalStorage(key) {
  const local = localStorage.getItem(key);
  if (local === null) return null;
  await storage.set(key, local);
  return local;
}

export const storage = {
  async get(key) {
    if (DEV_BYPASS_AUTH) {
      const local = localStorage.getItem(key);
      return local === null ? null : { value: local };
    }
    const { data, error } = await supabase
      .from("plan_data")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (data) return { value: data.value };

    const migrated = await migrateFromLocalStorage(key);
    return migrated === null ? null : { value: migrated };
  },
  async set(key, value) {
    if (DEV_BYPASS_AUTH) {
      localStorage.setItem(key, value);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("plan_data").upsert(
      {
        key,
        value,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) throw error;
  },
};
