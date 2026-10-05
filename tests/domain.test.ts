import { describe, expect, it } from "vitest";
import {
  applyAction,
  ranking,
  result,
  type Action,
  RUBRIC,
  rubricTotal,
  ANSWER_POINTS,
} from "../src/lib/domain";
import { mockCompetition } from "../src/lib/mock";
const full = {
  pitch: 25,
  rhythm: 20,
  technique: 20,
  expression: 20,
  stage: 15,
};
const zero = { pitch: 0, rhythm: 0, technique: 0, expression: 0, stage: 0 };
const admin = { role: "admin" } as const;
const open = () =>
  applyAction(
    mockCompetition(),
    { type: "open", contestantId: "c1", roundId: "r1" },
    admin,
  );
describe("scoring and voting", () => {
  it("uses the original audience points and locks them at the first competition action", () => {
    expect(ANSWER_POINTS).toEqual({ A: 100, B: 85, C: 70, D: 55 });
    let state = applyAction(
      mockCompetition(),
      { type: "points", points: { A: 99, B: 88, C: 77, D: 66 } },
      admin,
    );
    expect(result(state, "c2").audience).toBe(90.75);
    state = applyAction(
      state,
      { type: "open", contestantId: "c1", roundId: "r1" },
      admin,
    );
    expect(() =>
      applyAction(state, { type: "points", points: ANSWER_POINTS }, admin),
    ).toThrow("開始");
  });
  it.each([100, 70, 50, 30, 0])(
    "supports %s percent judge weighting",
    (weight) => {
      const state = applyAction(
        mockCompetition(),
        { type: "weight", value: weight },
        admin,
      );
      expect(result(state, "c2").total).toBeCloseTo(
        (83 * weight + 88.75 * (100 - weight)) / 100,
      );
    },
  );
  it.each(RUBRIC)("enforces $label maximum and nonnegative values", (item) => {
    for (const value of [-1, item.max + 0.1, NaN, Infinity])
      expect(() =>
        applyAction(
          mockCompetition(),
          {
            type: "score",
            contestantId: "c1",
            judgeId: "j1",
            rubric: { ...full, [item.key]: value },
          },
          admin,
        ),
      ).toThrow();
  });
  it("saves all five rubric values and derives total, with zero and 100 valid", () => {
    expect(rubricTotal(full)).toBe(100);
    expect(rubricTotal(zero)).toBe(0);
    const state = applyAction(
      mockCompetition(),
      { type: "score", contestantId: "c1", judgeId: "j1", rubric: full },
      admin,
    );
    expect(state.scores.at(-1)).toEqual({
      contestantId: "c1",
      judgeId: "j1",
      rubric: full,
      total: 100,
    });
    expect(state.weightsLocked).toBe(true);
  });
  it("locks weights, requires confirmation to unlock and recalculate, and records changes", () => {
    let state = open();
    expect(() =>
      applyAction(state, { type: "weight", value: 30 }, admin),
    ).toThrow("鎖定");
    state = applyAction(
      state,
      {
        type: "unlockWeights",
        confirmed: true,
        expectedRevision: state.revision,
      },
      admin,
    );
    expect(() =>
      applyAction(state, { type: "weight", value: 30 }, admin),
    ).toThrow("確認");
    expect(() =>
      applyAction(
        state,
        {
          type: "weight",
          value: 30,
          confirmed: true,
          expectedRevision: state.revision - 1,
        },
        admin,
      ),
    ).toThrow("確認");
    state = applyAction(
      state,
      {
        type: "weight",
        value: 30,
        confirmed: true,
        expectedRevision: state.revision,
      },
      admin,
    );
    expect(state.weightsLocked).toBe(true);
    expect(state.events.at(-1)?.detail).toContain("70% → 30%");
  });
  it("reopens with empty votes and a fresh ID, rejects old requests, then votes and locks again", () => {
    let state = applyAction(
      open(),
      { type: "votes", roundId: "r1", votes: [{ markerId: 0, answer: "D" }] },
      admin,
    );
    state = applyAction(state, { type: "lock", roundId: "r1" }, admin);
    const action = {
      type: "reopen",
      contestantId: "c1",
      roundId: "r2",
      confirmed: true,
      expectedRevision: state.revision,
    } as const;
    expect(() =>
      applyAction(
        state,
        { ...action, confirmed: false } as unknown as Action,
        admin,
      ),
    ).toThrow();
    state = applyAction(state, action, admin);
    expect(state.rounds.at(-1)?.votes).toEqual({});
    expect(state.events.at(-1)?.type).toBe("reopen");
    expect(() =>
      applyAction(
        state,
        { type: "votes", roundId: "r1", votes: [{ markerId: 1, answer: "A" }] },
        admin,
      ),
    ).toThrow();
    expect(() =>
      applyAction(
        state,
        { ...action, roundId: "r1", expectedRevision: state.revision },
        admin,
      ),
    ).toThrow("新");
    state = applyAction(
      state,
      { type: "votes", roundId: "r2", votes: [{ markerId: 39, answer: "B" }] },
      admin,
    );
    state = applyAction(state, { type: "lock", roundId: "r2" }, admin);
    expect(state.rounds.at(-1)).toMatchObject({
      status: "locked",
      votes: { 39: "B" },
    });
  });
  it("requires confirmed unpublish before reopening and skips judges for audience-only", () => {
    let state = mockCompetition();
    state.judgeWeight = 0;
    state.contestants = state.contestants.slice(1);
    state.scores = [];
    state = applyAction(state, { type: "publish", value: true }, admin);
    expect(() =>
      applyAction(
        state,
        {
          type: "reopen",
          contestantId: "c2",
          roundId: "new",
          confirmed: true,
          expectedRevision: state.revision,
        },
        admin,
      ),
    ).toThrow("公布");
    expect(() =>
      applyAction(state, { type: "publish", value: false }, admin),
    ).toThrow("確認");
    state = applyAction(
      state,
      {
        type: "publish",
        value: false,
        confirmed: true,
        expectedRevision: state.revision,
      },
      admin,
    );
    state = applyAction(
      state,
      {
        type: "reopen",
        contestantId: "c2",
        roundId: "new",
        confirmed: true,
        expectedRevision: state.revision,
      },
      admin,
    );
    expect(result(state, "c2").ready).toBe(false);
  });
  it("normalizes scores to 100 and applies exact weights", () => {
    const state = mockCompetition();
    expect(result(state, "c2").total).toBeCloseTo(83 * 0.7 + 88.75 * 0.3);
    state.judgeWeight = 100;
    expect(result(state, "c2").total).toBe(83);
    state.judgeWeight = 0;
    expect(result(state, "c2").total).toBe(88.75);
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
        {
          type: "score",
          contestantId: "c1",
          judgeId: "j1",
          rubric: { ...full, pitch: NaN },
        },
        admin,
      ),
    ).toThrow();
    expect(() =>
      applyAction(
        open(),
        {
          type: "votes",
          roundId: "r1",
          votes: [{ markerId: 40, answer: "A" }],
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
      rubric: zero,
    };
    const actor = { role: "judge", judgeId: "j1" } as const;
    let state = applyAction(open(), action, actor);
    expect(() =>
      applyAction(state, action, { role: "judge", judgeId: "j2" }),
    ).toThrow("權限");
    expect(() =>
      applyAction(state, { type: "weight", value: 20 }, actor),
    ).toThrow("權限");
    state = applyAction(state, { ...action, rubric: full }, actor);
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
    state.scores = state.scores.map((s) => ({ ...s, total: 80 }));
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
      applyAction(
        published,
        {
          type: "publish",
          value: false,
          confirmed: true,
          expectedRevision: published.revision,
        },
        admin,
      ).published,
    ).toBe(false);
  });
});
