import { describe, expect, it } from "vitest";
import { applyAction, ranking, result, type Action } from "../src/lib/domain";
import { mockCompetition } from "../src/lib/mock";
const admin = { role: "admin" } as const;
const open = () =>
  applyAction(
    mockCompetition(),
    { type: "open", contestantId: "c1", roundId: "r1" },
    admin,
  );
describe("scoring and voting", () => {
  it("normalizes scores to 100 and applies exact weights", () => {
    const state = mockCompetition();
    expect(result(state, "c2").total).toBeCloseTo(83 * 0.7 + 85 * 0.3);
    state.judgeWeight = 100;
    expect(result(state, "c2").total).toBe(83);
    state.judgeWeight = 0;
    expect(result(state, "c2").total).toBe(85);
  });
  it("keeps incomplete scores pending, including empty locked rounds", () => {
    expect(result(mockCompetition(), "c1").total).toBeNull();
    const state = open();
    state.judgeWeight = 0;
    state.rounds.at(-1)!.status = "locked";
    expect(result(state, "c1").ready).toBe(false);
  });
  it("deduplicates IDs, allows answer changes and rejects votes after locking", () => {
    const action: Action = {
      type: "votes",
      roundId: "r1",
      votes: [{ markerId: 0, answer: "A" }],
    };
    let state = applyAction(open(), action, admin);
    state = applyAction(state, action, admin);
    state = applyAction(
      state,
      {
        ...action,
        votes: [
          { markerId: 0, answer: "D" },
          { markerId: 1, answer: "B" },
        ],
      },
      admin,
    );
    expect(state.rounds.at(-1)!.votes).toEqual({ 0: "D", 1: "B" });
    state = applyAction(state, { type: "lock", roundId: "r1" }, admin);
    expect(() => applyAction(state, action, admin)).toThrow("鎖票");
  });
  it("rejects invalid weights, scores and card IDs", () => {
    expect(() =>
      applyAction(open(), { type: "weight", value: -1 }, admin),
    ).toThrow();
    expect(() =>
      applyAction(
        open(),
        { type: "score", contestantId: "c1", judgeId: "j1", value: NaN },
        admin,
      ),
    ).toThrow();
    expect(() =>
      applyAction(
        open(),
        {
          type: "votes",
          roundId: "r1",
          votes: [{ markerId: 20, answer: "A" }],
        },
        admin,
      ),
    ).toThrow();
  });
  it("enforces judge identity and replaces scores without duplication", () => {
    const action: Action = {
      type: "score",
      contestantId: "c1",
      judgeId: "j1",
      value: 0,
    };
    const actor = { role: "judge", judgeId: "j1" } as const;
    let state = applyAction(open(), action, actor);
    expect(() =>
      applyAction(state, action, { role: "judge", judgeId: "j2" }),
    ).toThrow("權限");
    expect(() =>
      applyAction(state, { type: "weight", value: 20 }, actor),
    ).toThrow("權限");
    state = applyAction(state, { ...action, value: 100 }, actor);
    expect(state.scores.filter((s) => s.contestantId === "c1")).toHaveLength(1);
  });
  it("blocks overlapping rounds, contestant switching, duplicate rounds and premature publishing", () => {
    expect(() =>
      applyAction(
        open(),
        { type: "open", contestantId: "c2", roundId: "r2" },
        admin,
      ),
    ).toThrow();
    expect(() =>
      applyAction(open(), { type: "select", contestantId: "c2" }, admin),
    ).toThrow();
    expect(() =>
      applyAction(
        mockCompetition(),
        { type: "open", contestantId: "c2", roundId: "r2" },
        admin,
      ),
    ).toThrow();
    expect(() =>
      applyAction(open(), { type: "publish", value: true }, admin),
    ).toThrow();
  });
  it("ranks ties equally, does not round until presentation, and freezes published results", () => {
    const state = mockCompetition();
    state.contestants = state.contestants.slice(1);
    state.judgeWeight = 100;
    state.scores = state.scores.map((s) => ({ ...s, value: 80 }));
    expect(ranking(state).map((r) => r.rank)).toEqual([1, 1, 1]);
    const published = applyAction(
      state,
      { type: "publish", value: true },
      admin,
    );
    expect(() =>
      applyAction(published, { type: "weight", value: 50 }, admin),
    ).toThrow("公布");
    expect(
      applyAction(published, { type: "publish", value: false }, admin)
        .published,
    ).toBe(false);
  });
});
