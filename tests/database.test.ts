import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { applyAction, type Competition } from "../src/lib/domain";

describe("SQL migrations and atomic persistence (real Postgres via PGlite)", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create publication supabase_realtime;",
    );
    await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
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
          JSON.stringify({ type: "test" }),
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
    invalid.scores.push({ judgeId: "unknown", contestantId: "c1", value: 70 });
    await expect(save(previous, invalid)).rejects.toThrow();
    expect((await state()).revision).toBe(previous.revision);
  });
  it("allows public scoreboard reads but denies tokens, RPC and direct writes", async () => {
    await db.exec("set role anon");
    expect((await db.query("select id from competitions")).rows).toHaveLength(
      1,
    );
    await expect(db.query("select * from judge_tokens")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      db.query("update competitions set title = 'tampered'"),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query(
        "select save_competition('luodong-live', 0, '{}'::jsonb, '{}'::jsonb)",
      ),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
});
