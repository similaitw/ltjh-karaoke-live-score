import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mockCompetition } from "../src/lib/mock";
import { applyAction, type Competition } from "../src/lib/domain";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  state: null as Competition | null,
  token: { judge_id: "j1", revoked: false, expires_at: "2099-01-01T00:00:00Z" },
  tokenHash: "",
  conflict: false,
  fail: false,
  writes: 0,
  sessions: new Map<
    string,
    { expires_at: string; credential_version: string }
  >(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      let hash = "";
      let deleting = false;
      const chain = {
        select: () => chain,
        eq: (name: string, value: string) => {
          if (name === "token_hash") hash = value;
          if (deleting) store.sessions.delete(hash);
          return chain;
        },
        insert: async (row: {
          token_hash: string;
          expires_at: string;
          credential_version: string;
        }) => {
          store.sessions.set(row.token_hash, row);
          return { error: null };
        },
        delete: () => {
          deleting = true;
          return chain;
        },
        single: async () => ({
          data: { state: structuredClone(store.state) },
          error: store.fail ? new Error("unavailable") : null,
        }),
        maybeSingle: async () => ({
          data:
            table === "admin_sessions"
              ? store.sessions.get(hash)
              : table === "judge_tokens" && hash === store.tokenHash
                ? store.token
                : null,
          error: null,
        }),
      };
      return chain;
    },
    rpc: async (_: string, args: { p_state: Competition }) => {
      if (store.conflict) {
        store.conflict = false;
        store.state = {
          ...store.state!,
          revision: store.state!.revision + 1,
          judgeWeight: 40,
        };
        return { data: false, error: null };
      }
      store.state = args.p_state;
      store.writes++;
      return { data: true, error: null };
    },
  }),
}));

import { GET, POST } from "../src/app/api/competition/route";
import {
  GET as status,
  POST as login,
  DELETE as logout,
} from "../src/app/api/admin/session/route";
const rubric = {
  pitch: 25,
  rhythm: 20,
  technique: 15,
  expression: 15,
  stage: 10,
};
const password = "test-only-admin-password";
const sessionRequest = (
  method: string,
  cookie = "",
  body?: unknown,
  origin = "http://localhost",
) =>
  new Request("http://localhost/api/admin/session", {
    method,
    headers: { Cookie: cookie, Origin: origin },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function sessionCookie() {
  const response = await login(sessionRequest("POST", "", { password }));
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
const post = async (body: unknown, token?: string, cookie?: string) =>
  POST(
    new Request("http://localhost/api/competition", {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Cookie: cookie ?? (token === undefined ? await sessionCookie() : ""),
      },
      body: JSON.stringify(body),
    }),
  );

describe("competition API trust boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-mock-key");
    vi.stubEnv("ADMIN_PASSWORD", password);
    store.sessions.clear();
    store.state = mockCompetition();
    store.fail = false;
    store.conflict = false;
    store.writes = 0;
    store.token = {
      judge_id: "j1",
      revoked: false,
      expires_at: "2099-01-01T00:00:00Z",
    };
    store.tokenHash = createHash("sha256")
      .update("judge-test-token")
      .digest("hex");
  });
  it("serves uncached public state and reports database failure", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).id).toBe("luodong-live");
    store.fail = true;
    expect((await GET()).status).toBe(503);
  });
  it("logs in with an HttpOnly SameSite cookie, permits writes, and revokes even a copied cookie on logout", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await login(sessionRequest("POST", "", { password }));
    const header = response.headers.get("set-cookie")!;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=strict");
    expect(header).not.toContain(password);
    const cookie = header.split(";")[0];
    expect(await (await status(sessionRequest("GET", cookie))).json()).toEqual({
      authenticated: true,
    });
    expect((await post({ type: "weight", value: 30 }, "", cookie)).status).toBe(
      200,
    );
    expect(
      (await logout(sessionRequest("DELETE", cookie))).headers.get(
        "set-cookie",
      ),
    ).toContain("Max-Age=0");
    expect((await post({ type: "weight", value: 50 }, "", cookie)).status).toBe(
      401,
    );
    expect(await (await status(sessionRequest("GET", cookie))).json()).toEqual({
      authenticated: false,
    });
    vi.stubEnv("NODE_ENV", "test");
  });
  it("rejects wrong passwords, old admin tokens, forged/expired sessions and rotated passwords", async () => {
    expect(
      (await login(sessionRequest("POST", "", { password: "wrong" }))).status,
    ).toBe(401);
    vi.stubEnv("ADMIN_TOKEN", "legacy-token");
    expect(
      (await post({ type: "weight", value: 50 }, "legacy-token")).status,
    ).toBe(401);
    expect(
      (
        await post(
          { type: "weight", value: 50 },
          "",
          `ltjh_admin=${"a".repeat(64)}`,
        )
      ).status,
    ).toBe(401);
    const expired = await sessionCookie();
    for (const row of store.sessions.values())
      row.expires_at = "2000-01-01T00:00:00Z";
    expect(
      (await post({ type: "weight", value: 50 }, "", expired)).status,
    ).toBe(401);
    const cookie = await sessionCookie();
    vi.stubEnv("ADMIN_PASSWORD", "rotated-password");
    expect((await post({ type: "weight", value: 50 }, "", cookie)).status).toBe(
      401,
    );
    expect(store.writes).toBe(0);
  });
  it("rejects cross-origin login, logout and competition writes", async () => {
    expect(
      (
        await login(
          sessionRequest("POST", "", { password }, "https://elsewhere.example"),
        )
      ).status,
    ).toBe(403);
    const cookie = await sessionCookie();
    expect(
      (
        await logout(
          sessionRequest(
            "DELETE",
            cookie,
            undefined,
            "https://elsewhere.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          new Request("http://localhost/api/competition", {
            method: "POST",
            headers: { Cookie: cookie, Origin: "https://elsewhere.example" },
            body: JSON.stringify({ type: "weight", value: 30 }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(store.writes).toBe(0);
  });
  it("validates rubric limits and overwrites all components of the same judge score", async () => {
    const score = { type: "score", contestantId: "c1", judgeId: "j1", rubric };
    expect(
      (
        await post(
          { ...score, rubric: { ...rubric, pitch: 26 } },
          "judge-test-token",
        )
      ).status,
    ).toBe(400);
    expect((await post(score, "judge-test-token")).status).toBe(200);
    expect(
      (
        await post(
          { ...score, rubric: { ...rubric, pitch: 20 }, total: 999 },
          "judge-test-token",
        )
      ).status,
    ).toBe(200);
    const scores = store.state!.scores.filter((s) => s.contestantId === "c1");
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({
      rubric: { ...rubric, pitch: 20 },
      total: 80,
    });
  });
  it("does not elevate judge credentials when an admin cookie is also present", async () => {
    expect(
      (
        await post(
          { type: "weight", value: 20 },
          "judge-test-token",
          await sessionCookie(),
        )
      ).status,
    ).toBe(422);
  });
  it("reopens through the API and rejects delayed requests from the old round", async () => {
    for (const action of [
      { type: "open", contestantId: "c1", roundId: "r1" },
      { type: "votes", roundId: "r1", votes: [{ markerId: 0, answer: "D" }] },
      { type: "lock", roundId: "r1" },
    ])
      expect((await post(action)).status).toBe(200);
    expect(
      (
        await post({
          type: "reopen",
          contestantId: "c1",
          roundId: "r2",
          confirmed: true,
          expectedRevision: store.state!.revision,
        })
      ).status,
    ).toBe(200);
    expect(store.state!.rounds.at(-1)?.votes).toEqual({});
    expect(
      (
        await post({
          type: "votes",
          roundId: "r1",
          votes: [{ markerId: 1, answer: "A" }],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await post({
          type: "votes",
          roundId: "r2",
          votes: [{ markerId: 39, answer: "B" }],
        })
      ).status,
    ).toBe(200);
    expect((await post({ type: "lock", roundId: "r2" })).status).toBe(200);
  });
  it("rejects unauthenticated, expired and revoked writes", async () => {
    expect((await post({ type: "weight", value: 20 }, "")).status).toBe(401);
    const score = {
      type: "score",
      contestantId: "c1",
      judgeId: "j1",
      rubric,
    };
    store.token.revoked = true;
    expect((await post(score, "judge-test-token")).status).toBe(401);
    store.token.revoked = false;
    store.token.expires_at = "2000-01-01T00:00:00Z";
    expect((await post(score, "judge-test-token")).status).toBe(401);
    expect(store.writes).toBe(0);
  });
  it("allows own score but rejects impersonation and control actions", async () => {
    const score = {
      type: "score",
      contestantId: "c1",
      judgeId: "j1",
      rubric,
    };
    expect((await post(score, "judge-test-token")).status).toBe(200);
    expect(
      (await post({ ...score, judgeId: "j2" }, "judge-test-token")).status,
    ).toBe(422);
    expect(
      (await post({ type: "weight", value: 20 }, "judge-test-token")).status,
    ).toBe(422);
    expect(store.writes).toBe(1);
  });
  it("retries stale revisions without dropping a concurrent update", async () => {
    store.conflict = true;
    expect(
      (
        await post({
          type: "score",
          contestantId: "c1",
          judgeId: "j1",
          rubric,
        })
      ).status,
    ).toBe(200);
    expect(store.state!.judgeWeight).toBe(40);
    expect(store.state!.scores).toContainEqual({
      contestantId: "c1",
      judgeId: "j1",
      rubric,
      total: 85,
    });
  });
  it("rejects late votes after locking and malformed input", async () => {
    store.state = applyAction(
      store.state!,
      { type: "open", contestantId: "c1", roundId: "r1" },
      { role: "admin" },
    );
    store.state = applyAction(
      store.state,
      { type: "lock", roundId: "r1" },
      { role: "admin" },
    );
    expect(
      (
        await post({
          type: "votes",
          roundId: "r1",
          votes: [{ markerId: 0, answer: "A" }],
        })
      ).status,
    ).toBe(422);
    expect((await post({ type: "weight", value: 101 })).status).toBe(400);
    expect(
      (
        await POST(
          new Request("http://localhost/api/competition", {
            method: "POST",
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(store.writes).toBe(0);
  });
});
