import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  hasAdminSession,
  passwordMatches,
  revokeSession,
  sameOrigin,
} from "@/lib/session";

export const dynamic = "force-dynamic";
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    return json({ authenticated: await hasAdminSession(request) });
  } catch {
    return json({ error: "無法驗證登入狀態" }, 503);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "來源不符" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "請求過大" }, 413);
    const { password } = JSON.parse(raw);
    if (!passwordMatches(password))
      return json({ error: "密碼錯誤或尚未設定管理密碼" }, 401);
    await revokeSession(request);
    const token = await createSession();
    const response = json({ authenticated: true });
    response.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return response;
  } catch (error) {
    return json(
      { error: "登入失敗，請檢查設定後重試" },
      error instanceof SyntaxError ? 400 : 503,
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "來源不符" }, 403);
  try {
    await revokeSession(request);
    const response = json({ authenticated: false });
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    return response;
  } catch {
    return json({ error: "登出失敗，請重試" }, 503);
  }
}
