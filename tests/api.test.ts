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
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      let hash = "";
      const chain = {
        select: () => chain,
        eq: (name: string, value: string) => {
          if (name === "token_hash") hash = value;
          return chain;
        },
        single: async () => ({
          data: { state: structuredClone(store.state) },
          error: store.fail ? new Error("unavailable") : null,
        }),
        maybeSingle: async () => ({
          data:
            table === "judge_tokens" && hash === store.tokenHash
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
const post = (body: unknown, token = "admin-test-token") =>
  POST(
    new Request("http://localhost/api/competition", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );

describe("competition API trust boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-mock-key");
    vi.stubEnv("ADMIN_TOKEN", "admin-test-token");
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
  it("rejects unauthenticated, expired and revoked writes", async () => {
    expect((await post({ type: "weight", value: 20 }, "")).status).toBe(401);
    const score = {
      type: "score",
      contestantId: "c1",
      judgeId: "j1",
      value: 85,
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
      value: 85,
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
          value: 85,
        })
      ).status,
    ).toBe(200);
    expect(store.state!.judgeWeight).toBe(40);
    expect(store.state!.scores).toContainEqual({
      contestantId: "c1",
      judgeId: "j1",
      value: 85,
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
