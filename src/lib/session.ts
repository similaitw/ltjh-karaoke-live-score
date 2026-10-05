import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { database } from "./server";

export const SESSION_COOKIE = "ltjh_admin";
export const SESSION_SECONDS = 8 * 60 * 60;
const digest = (value: string) => createHash("sha256").update(value).digest();
const version = () =>
  createHmac("sha256", process.env.ADMIN_PASSWORD ?? "")
    .update("admin-session-version")
    .digest("hex");
export function passwordMatches(password: unknown) {
  const expected = process.env.ADMIN_PASSWORD;
  return (
    !!expected &&
    typeof password === "string" &&
    password.length <= 512 &&
    timingSafeEqual(digest(password), digest(expected))
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
function sessionToken(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1) ?? ""
  );
}
export async function createSession() {
  const token = randomBytes(32).toString("hex");
  const { error } = await database()
    .from("admin_sessions")
    .insert({
      token_hash: digest(token).toString("hex"),
      credential_version: version(),
      expires_at: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
    });
  if (error) throw new Error("建立管理工作階段失敗");
  return token;
}
export async function hasAdminSession(request: Request) {
  const token = sessionToken(request);
  if (!process.env.ADMIN_PASSWORD || !/^[a-f0-9]{64}$/.test(token))
    return false;
  const { data, error } = await database()
    .from("admin_sessions")
    .select("expires_at, credential_version")
    .eq("token_hash", digest(token).toString("hex"))
    .maybeSingle();
  if (error) throw new Error("驗證管理工作階段失敗");
  return (
    !!data &&
    Date.parse(data.expires_at) > Date.now() &&
    data.credential_version === version()
  );
}
export async function revokeSession(request: Request) {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  const { error } = await database()
    .from("admin_sessions")
    .delete()
    .eq("token_hash", digest(token).toString("hex"));
  if (error) throw new Error("登出失敗，請重試");
}
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
});
