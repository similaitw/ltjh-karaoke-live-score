import { NextResponse } from "next/server";
import { actionSchema, applyAction, type Competition } from "@/lib/domain";
import { authenticate, database } from "@/lib/server";
import { hasAdminSession, sameOrigin } from "@/lib/session";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const { data, error } = await database()
      .from("competitions")
      .select("state")
      .eq("id", "luodong-live")
      .single();
    if (error) throw new Error("找不到競賽，請先執行 migration 與 seed");
    return NextResponse.json(data.state, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "來源不符" }, { status: 403 });
  try {
    const body = await request.text();
    if (body.length > 16_384)
      return NextResponse.json({ error: "請求過大" }, { status: 413 });
    const parsed = actionSchema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return NextResponse.json({ error: "操作資料格式錯誤" }, { status: 400 });
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/)?.[1];
    // An explicit judge credential retains its restricted identity even in an admin browser.
    const actor = bearer
      ? await authenticate(bearer)
      : (await hasAdminSession(request))
        ? { role: "admin" as const }
        : null;
    if (!actor)
      return NextResponse.json(
        { error: "請先登入管理者，或確認評審代碼有效" },
        { status: 401 },
      );
    const db = database();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await db
        .from("competitions")
        .select("state")
        .eq("id", "luodong-live")
        .single();
      if (error) throw new Error("讀取競賽失敗");
      const state = data.state as Competition;
      let next: Competition;
      try {
        next = applyAction(state, parsed.data, actor);
      } catch (error) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 422 },
        );
      }
      const saved = await db.rpc("save_competition", {
        p_id: state.id,
        p_revision: state.revision,
        p_state: next,
        p_event: {
          type: parsed.data.type,
          actor: actor.role === "admin" ? "admin" : actor.judgeId,
          revision: next.revision,
          detail: next.events.at(-1)?.detail,
        },
      });
      if (saved.error) throw new Error("儲存失敗，請確認資料庫 migration");
      if (saved.data) return NextResponse.json(next, { headers });
    }
    return NextResponse.json(
      { error: "同時操作過多，請重試" },
      { status: 409 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SyntaxError
            ? "JSON 格式錯誤"
            : (error as Error).message,
      },
      { status: error instanceof SyntaxError ? 400 : 503 },
    );
  }
}
