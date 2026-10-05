import { z } from "zod";

export const answerSchema = z.enum(["A", "B", "C", "D"]);
export type Answer = z.infer<typeof answerSchema>;
export const ANSWER_POINTS: Record<Answer, number> = {
  A: 100,
  B: 80,
  C: 60,
  D: 40,
};
export type Contestant = {
  id: string;
  name: string;
  song: string;
  className: string;
};
export type Judge = { id: string; name: string };
export type Score = { judgeId: string; contestantId: string; value: number };
export type Round = {
  id: string;
  contestantId: string;
  status: "open" | "locked";
  votes: Record<string, Answer>;
};
export type Competition = {
  id: string;
  title: string;
  revision: number;
  judgeWeight: number;
  activeContestantId: string;
  contestants: Contestant[];
  judges: Judge[];
  scores: Score[];
  rounds: Round[];
  published: boolean;
};

const id = z.string().min(1).max(100);
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("weight"),
    value: z.number().int().min(0).max(100),
  }),
  z.object({ type: z.literal("select"), contestantId: id }),
  z.object({
    type: z.literal("score"),
    contestantId: id,
    judgeId: id,
    value: z.number().min(0).max(100),
  }),
  z.object({ type: z.literal("open"), contestantId: id, roundId: id }),
  z.object({
    type: z.literal("votes"),
    roundId: id,
    votes: z
      .array(
        z.object({
          markerId: z.number().int().min(0).max(19),
          answer: answerSchema,
        }),
      )
      .min(1)
      .max(20),
  }),
  z.object({ type: z.literal("lock"), roundId: id }),
  z.object({ type: z.literal("publish"), value: z.boolean() }),
]);
export type Action = z.infer<typeof actionSchema>;
export type Actor = { role: "admin" } | { role: "judge"; judgeId: string };

export function applyAction(
  state: Competition,
  input: Action,
  actor: Actor,
): Competition {
  const action = actionSchema.parse(input);
  if (
    actor.role === "judge" &&
    (action.type !== "score" || action.judgeId !== actor.judgeId)
  )
    throw new Error("沒有操作權限");
  if (state.published && !(action.type === "publish" && !action.value))
    throw new Error("成績已公布，請先由控制台取消公布");
  const next = structuredClone(state);
  const contestantId = "contestantId" in action ? action.contestantId : null;
  if (contestantId && !state.contestants.some((c) => c.id === contestantId))
    throw new Error("找不到參賽者");
  switch (action.type) {
    case "weight":
      next.judgeWeight = action.value;
      break;
    case "select":
      if (state.rounds.some((r) => r.status === "open"))
        throw new Error("請先鎖定目前輪次");
      next.activeContestantId = action.contestantId;
      break;
    case "score": {
      if (!state.judges.some((j) => j.id === action.judgeId))
        throw new Error("找不到評審");
      next.scores = next.scores.filter(
        (s) =>
          !(
            s.judgeId === action.judgeId &&
            s.contestantId === action.contestantId
          ),
      );
      next.scores.push({
        judgeId: action.judgeId,
        contestantId: action.contestantId,
        value: action.value,
      });
      break;
    }
    case "open":
      if (state.rounds.some((r) => r.status === "open"))
        throw new Error("已有進行中的輪次");
      if (
        state.rounds.some(
          (r) =>
            r.contestantId === action.contestantId || r.id === action.roundId,
        )
      )
        throw new Error("此參賽者已有投票輪次");
      next.activeContestantId = action.contestantId;
      next.rounds.push({
        id: action.roundId,
        contestantId: action.contestantId,
        status: "open",
        votes: {},
      });
      break;
    case "votes": {
      const round = next.rounds.find((r) => r.id === action.roundId);
      if (!round || round.status !== "open")
        throw new Error("輪次已鎖票或不存在");
      for (const vote of action.votes)
        round.votes[String(vote.markerId)] = vote.answer;
      break;
    }
    case "lock": {
      const round = next.rounds.find((r) => r.id === action.roundId);
      if (!round) throw new Error("找不到輪次");
      round.status = "locked";
      break;
    }
    case "publish":
      if (action.value && state.rounds.some((r) => r.status === "open"))
        throw new Error("請先鎖定目前輪次");
      if (
        action.value &&
        !state.contestants.every((c) => result(state, c.id).ready)
      )
        throw new Error("請先完成所有必要評分並鎖票");
      next.published = action.value;
      break;
  }
  next.revision++;
  return next;
}

export function result(state: Competition, contestantId: string) {
  const scores = state.scores.filter((s) => s.contestantId === contestantId);
  const round = state.rounds.find((r) => r.contestantId === contestantId);
  const votes = Object.values(round?.votes ?? {});
  const judge = scores.length
    ? scores.reduce((sum, s) => sum + s.value, 0) / scores.length
    : null;
  const audience = votes.length
    ? votes.reduce((sum, v) => sum + ANSWER_POINTS[v], 0) / votes.length
    : null;
  const ready =
    (state.judgeWeight === 0 || scores.length === state.judges.length) &&
    (state.judgeWeight === 100 ||
      (round?.status === "locked" && audience !== null));
  const total = ready
    ? ((judge ?? 0) * state.judgeWeight +
        (audience ?? 0) * (100 - state.judgeWeight)) /
      100
    : null;
  return {
    judge,
    audience,
    total,
    ready,
    voteCount: votes.length,
    judgeCount: scores.length,
  };
}

export function ranking(state: Competition) {
  const rows = state.contestants
    .map((c) => ({ ...c, ...result(state, c.id) }))
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  return rows.map((row, index) => ({
    ...row,
    rank:
      row.total === null
        ? null
        : rows.findIndex((r) => r.total === row.total) + 1,
    order: index,
  }));
}
