import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { applyAction, type Competition } from "../src/lib/domain";
import { mockCompetition } from "../src/lib/mock";

describe("SQL migrations and atomic persistence (real Postgres via PGlite)", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create publication supabase_realtime;",
    );
    await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
    await db.exec(
      readFileSync("supabase/migrations/002_review_fixes.sql", "utf8"),
    );
    await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  }, 30000);
  afterAll(async () => {
    await db.close();
  });

  async function state() {
    return (
      await db.query<{ state: Competition }>("select state from competitions")
    ).rows[0].state;
  }
  async function save(previous: Competition, next: Competition) {
    return (
      await db.query<{ saved: boolean }>(
        "select save_competition($1, $2, $3, $4) as saved",
        [
          previous.id,
          previous.revision,
          JSON.stringify(next),
          JSON.stringify(next.events.at(-1) ?? { type: "test" }),
        ],
      )
    ).rows[0].saved;
  }
  it("seeds normalized contestants, judges, scores, rounds, votes, settings and events", async () => {
    for (const [table, count] of Object.entries({
      contestants: 4,
      judges: 3,
      judge_scores: 9,
      audience_rounds: 3,
      audience_votes: 60,
      settings: 1,
      events: 1,
      judge_tokens: 0,
    })) {
      expect(
        (
          await db.query<{ n: number }>(
            `select count(*)::int as n from ${table}`,
          )
        ).rows[0].n,
      ).toBe(count);
    }
  });
  it("rejects stale revisions without overwriting another writer", async () => {
    const previous = await state();
    const a = applyAction(
      previous,
      { type: "weight", value: 50 },
      { role: "admin" },
    );
    const b = applyAction(
      previous,
      { type: "weight", value: 0 },
      { role: "admin" },
    );
    expect(await save(previous, a)).toBe(true);
    expect(await save(previous, b)).toBe(false);
    expect((await state()).judgeWeight).toBe(50);
    expect(
      (
        await db.query<{ judge_weight: number }>(
          "select judge_weight from settings",
        )
      ).rows[0].judge_weight,
    ).toBe(50);
  });
  it("stores one vote per card and projects corrected answers", async () => {
    const previous = await state();
    const opened = applyAction(
      previous,
      { type: "open", contestantId: "c1", roundId: "r1" },
      { role: "admin" },
    );
    expect(await save(previous, opened)).toBe(true);
    const voted = applyAction(
      opened,
      { type: "votes", roundId: "r1", votes: [{ markerId: 0, answer: "A" }] },
      { role: "admin" },
    );
    await save(opened, voted);
    const changed = applyAction(
      voted,
      { type: "votes", roundId: "r1", votes: [{ markerId: 0, answer: "B" }] },
      { role: "admin" },
    );
    await save(voted, changed);
    expect(
      (
        await db.query(
          "select marker_id, answer from audience_votes where round_id = $1",
          ["r1"],
        )
      ).rows,
    ).toEqual([{ marker_id: 0, answer: "B" }]);
  });
  it("rolls back snapshot and events when a relational constraint fails", async () => {
    const previous = await state();
    const invalid = structuredClone(previous);
    invalid.revision++;
    invalid.scores.push({
      judgeId: "unknown",
      contestantId: "c1",
      rubric: null,
      total: 70,
    });
    await expect(save(previous, invalid)).rejects.toThrow();
    expect((await state()).revision).toBe(previous.revision);
  });
  it("persists rubric and total without duplicate judge rows and enforces limits in SQL", async () => {
    let previous = await state();
    for (const pitch of [25, 20]) {
      const next = applyAction(
        previous,
        {
          type: "score",
          contestantId: "c1",
          judgeId: "j1",
          rubric: {
            pitch,
            rhythm: 20,
            technique: 20,
            expression: 20,
            stage: 15,
          },
        },
        { role: "judge", judgeId: "j1" },
      );
      expect(await save(previous, next)).toBe(true);
      previous = next;
    }
    const rows = (
      await db.query(
        "select rubric, total::float from judge_scores where contestant_id='c1'",
      )
    ).rows;
    expect(rows).toEqual([
      {
        rubric: {
          pitch: 20,
          rhythm: 20,
          technique: 20,
          expression: 20,
          stage: 15,
        },
        total: 95,
      },
    ]);
    for (const rubric of [
      { pitch: 26, rhythm: 20, technique: 20, expression: 20, stage: 9 },
      { pitch: 20 },
      { pitch: 20, rhythm: 20, technique: 20, expression: 20, stage: 14 },
    ]) {
      await expect(
        db.query("update judge_scores set rubric=$1 where contestant_id='c1'", [
          JSON.stringify(rubric),
        ]),
      ).rejects.toThrow();
    }
    expect((await state()).revision).toBe(previous.revision);
  });
  it("atomically removes old round/vote projections, retains other contestants, and logs reopen", async () => {
    let previous = await state();
    const locked = applyAction(
      previous,
      { type: "lock", roundId: "r1" },
      { role: "admin" },
    );
    await save(previous, locked);
    const reopened = applyAction(
      locked,
      {
        type: "reopen",
        contestantId: "c1",
        roundId: "r2",
        confirmed: true,
        expectedRevision: locked.revision,
      },
      { role: "admin" },
    );
    expect(await save(locked, reopened)).toBe(true);
    expect(
      (
        await db.query(
          "select * from audience_votes where round_id in ('r1','r2')",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from audience_rounds where id='r1'")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from audience_votes")).rows).toHaveLength(
      60,
    );
    expect(
      (
        await db.query(
          "select payload->>'type' as type from events order by revision desc limit 1",
        )
      ).rows,
    ).toEqual([{ type: "reopen" }]);
    previous = reopened;
    const voted = applyAction(
      previous,
      { type: "votes", roundId: "r2", votes: [{ markerId: 39, answer: "C" }] },
      { role: "admin" },
    );
    await save(previous, voted);
    const final = applyAction(
      voted,
      { type: "lock", roundId: "r2" },
      { role: "admin" },
    );
    await save(voted, final);
    expect(
      (
        await db.query(
          "select marker_id, answer from audience_votes where round_id='r2'",
        )
      ).rows,
    ).toEqual([{ marker_id: 39, answer: "C" }]);
    expect((await state()).rounds.at(-1)?.status).toBe("locked");
  });
  it("allows public scoreboard reads but denies tokens, RPC and direct writes", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      expect((await db.query("select id from competitions")).rows).toHaveLength(
        1,
      );
      await expect(db.query("select * from judge_tokens")).rejects.toThrow(
        "permission denied",
      );
      await expect(db.query("select * from admin_sessions")).rejects.toThrow(
        "permission denied",
      );
      await expect(db.query("delete from admin_sessions")).rejects.toThrow(
        "permission denied",
      );
      await expect(
        db.query("update audience_votes set answer = 'D'"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("update judge_scores set value = 100"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("update competitions set title = 'tampered'"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query(
          "select save_competition('luodong-live', 0, '{}'::jsonb, '{}'::jsonb)",
        ),
      ).rejects.toThrow("permission denied");
      await db.exec("reset role");
    }
  });
});

describe("upgrade an existing M1 database", () => {
  it("preserves old totals, marks missing rubric, locks started settings and refuses silent published changes", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "create role anon; create role authenticated; create role service_role bypassrls; create publication supabase_realtime;",
      );
      await db.exec(
        readFileSync("supabase/migrations/001_initial.sql", "utf8"),
      );
      const current = mockCompetition();
      const legacy = {
        id: current.id,
        title: current.title,
        revision: 0,
        judgeWeight: 70,
        activeContestantId: "c1",
        contestants: current.contestants,
        judges: current.judges,
        scores: current.scores.map((s) => ({
          judgeId: s.judgeId,
          contestantId: s.contestantId,
          value: s.total,
        })),
        rounds: current.rounds,
        published: true,
      };
      await db.query(
        "insert into competitions(id,title,state) values ($1,$2,$3)",
        [legacy.id, legacy.title, JSON.stringify(legacy)],
      );
      await db.query("select save_competition($1,0,$2,'{}')", [
        legacy.id,
        JSON.stringify({ ...legacy, revision: 1 }),
      ]);
      await expect(
        db.exec(
          readFileSync("supabase/migrations/002_review_fixes.sql", "utf8"),
        ),
      ).rejects.toThrow("Unpublish");
      await db.exec("rollback");
      await db.query("select save_competition($1,1,$2,'{}')", [
        legacy.id,
        JSON.stringify({ ...legacy, revision: 2, published: false }),
      ]);
      await db.exec(
        readFileSync("supabase/migrations/002_review_fixes.sql", "utf8"),
      );
      const upgraded = (
        await db.query<{ state: Competition }>("select state from competitions")
      ).rows[0].state;
      expect(upgraded.audiencePoints).toEqual({ A: 100, B: 85, C: 70, D: 55 });
      expect(upgraded.scores[0]).toEqual({
        judgeId: "j1",
        contestantId: "c2",
        rubric: null,
        total: 82,
      });
      expect(upgraded.weightsLocked).toBe(true);
      expect(upgraded.started).toBe(true);
      const next = applyAction(
        upgraded,
        {
          type: "score",
          contestantId: "c2",
          judgeId: "j1",
          rubric: {
            pitch: 25,
            rhythm: 20,
            technique: 20,
            expression: 20,
            stage: 15,
          },
        },
        { role: "judge", judgeId: "j1" },
      );
      await db.query("select save_competition($1,2,$2,'{}')", [
        legacy.id,
        JSON.stringify(next),
      ]);
      expect(
        (
          await db.query(
            "select total::int as total from judge_scores where judge_id='j1' and contestant_id='c2'",
          )
        ).rows,
      ).toEqual([{ total: 100 }]);
    } finally {
      await db.close();
    }
  }, 30000);
});
