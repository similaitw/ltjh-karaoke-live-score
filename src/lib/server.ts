import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Actor } from "./domain";

export function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "supabase" || !url || !key)
    throw new Error("Supabase 伺服器環境尚未設定");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticate(token: string): Promise<Actor | null> {
  if (!token || token.length > 512) return null;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const { data, error } = await database()
    .from("judge_tokens")
    .select("judge_id, expires_at, revoked")
    .eq("token_hash", digest(token).toString("hex"))
    .eq("competition_id", "luodong-live")
    .maybeSingle();
  if (error) throw new Error("無法驗證評審代碼");
  if (!data || data.revoked || Date.parse(data.expires_at) <= Date.now())
    return null;
  return { role: "judge", judgeId: data.judge_id };
}
