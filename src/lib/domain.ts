import { z } from "zod";
import { CARD_COUNT } from "./card-config";

export const answerSchema = z.enum(["A", "B", "C", "D"]);
export type Answer = z.infer<typeof answerSchema>;
export const ANSWER_POINTS: Record<Answer, number> = {
  A: 100,
  B: 85,
  C: 70,
  D: 55,
};
export const RUBRIC = [
  { key: "pitch", label: "音準", max: 25 },
  { key: "rhythm", label: "節奏", max: 20 },
  { key: "technique", label: "歌唱技巧", max: 20 },
  { key: "expression", label: "情感表達", max: 20 },
  { key: "stage", label: "舞台表現", max: 15 },
] as const;
export const rubricSchema = z
  .object({
    pitch: z.number().min(0).max(25),
    rhythm: z.number().min(0).max(20),
    technique: z.number().min(0).max(20),
    expression: z.number().min(0).max(20),
    stage: z.number().min(0).max(15),
  })
  .strict();
export type Rubric = z.infer<typeof rubricSchema>;
export function rubricTotal(rubric: Rubric) {
  return (
    Math.round(RUBRIC.reduce((sum, item) => sum + rubric[item.key], 0) * 1e8) /
    1e8
  );
}
const pointsSchema = z
  .object({
    A: z.number().min(0).max(100),
    B: z.number().min(0).max(100),
    C: z.number().min(0).max(100),
    D: z.number().min(0).max(100),
  })
  .strict();
export type Contestant = {
  id: string;
  name: string;
  song: string;
  className: string;
};
export type Judge = { id: string; name: string };
export type Score = {
  judgeId: string;
  contestantId: string;
  rubric: Rubric | null;
  total: number;
};
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
  audiencePoints: Record<Answer, number>;
  started: boolean;
  weightsLocked: boolean;
  retiredRoundIds: string[];
  events: { type: string; revision: number; detail: string }[];
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
    confirmed: z.literal(true).optional(),
    expectedRevision: z.number().int().optional(),
  }),
  z.object({ type: z.literal("points"), points: pointsSchema }),
  z.object({
    type: z.literal("unlockWeights"),
    confirmed: z.literal(true),
    expectedRevision: z.number().int(),
  }),
  z.object({ type: z.literal("select"), contestantId: id }),
  z.object({
    type: z.literal("score"),
    contestantId: id,
    judgeId: id,
    rubric: rubricSchema,
  }),
  z.object({ type: z.literal("open"), contestantId: id, roundId: id }),
  z.object({
    type: z.literal("reopen"),
    contestantId: id,
    roundId: id,
    confirmed: z.literal(true),
    expectedRevision: z.number().int(),
  }),
  z.object({
    type: z.literal("votes"),
    roundId: id,
    votes: z
      .array(
        z.object({
          markerId: z
            .number()
            .int()
            .min(0)
            .max(CARD_COUNT - 1),
          answer: answerSchema,
        }),
      )
      .min(1)
      .max(CARD_COUNT),
  }),
  z.object({ type: z.literal("lock"), roundId: id }),
  z.object({
    type: z.literal("publish"),
    value: z.boolean(),
    confirmed: z.literal(true).optional(),
    expectedRevision: z.number().int().optional(),
  }),
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
  const confirmCurrent = () => {
    if (
      !("confirmed" in action) ||
      !action.confirmed ||
      !("expectedRevision" in action) ||
      action.expectedRevision !== state.revision
    )
      throw new Error("請重新確認操作；資料可能已更新");
  };
  const next = structuredClone(state);
  const contestantId = "contestantId" in action ? action.contestantId : null;
  if (contestantId && !state.contestants.some((c) => c.id === contestantId))
    throw new Error("找不到參賽者");
  switch (action.type) {
    case "weight":
      if (state.weightsLocked)
        throw new Error("比賽已開始，權重已鎖定，請先確認解鎖");
      if (state.started) confirmCurrent();
      next.judgeWeight = action.value;
      next.weightsLocked = state.started;
      break;
    case "points":
      if (state.started) throw new Error("比賽開始後不可修改觀眾分數");
      next.audiencePoints = action.points;
      break;
    case "unlockWeights":
      confirmCurrent();
      next.weightsLocked = false;
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
        rubric: action.rubric,
        total: rubricTotal(action.rubric),
      });
      next.started = true;
      next.weightsLocked = true;
      break;
    }
    case "open":
      if (state.rounds.some((r) => r.status === "open"))
        throw new Error("已有進行中的輪次");
      if (
        state.retiredRoundIds.includes(action.roundId) ||
        state.rounds.some(
          (r) =>
            r.contestantId === action.contestantId || r.id === action.roundId,
        )
      )
        throw new Error("此參賽者已有投票輪次");
      next.activeContestantId = action.contestantId;
      next.started = true;
      next.weightsLocked = true;
      next.rounds.push({
        id: action.roundId,
        contestantId: action.contestantId,
        status: "open",
        votes: {},
      });
      break;
    case "reopen": {
      confirmCurrent();
      const previous = state.rounds.find(
        (r) => r.contestantId === action.contestantId,
      );
      if (!previous) throw new Error("找不到輪次");
      if (state.rounds.some((r) => r.status === "open" && r.id !== previous.id))
        throw new Error("請先鎖定目前輪次");
      if (
        state.rounds.some((r) => r.id === action.roundId) ||
        state.retiredRoundIds.includes(action.roundId)
      )
        throw new Error("重新開票必須使用新的輪次 ID");
      next.retiredRoundIds.push(previous.id);
      next.rounds = next.rounds.filter((r) => r.id !== previous.id);
      next.rounds.push({
        id: action.roundId,
        contestantId: action.contestantId,
        status: "open",
        votes: {},
      });
      next.activeContestantId = action.contestantId;
      next.started = true;
      next.weightsLocked = true;
      break;
    }
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
      if (!action.value) confirmCurrent();
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
  next.events.push({
    type: action.type,
    revision: next.revision,
    detail:
      action.type === "weight"
        ? `評審 ${state.judgeWeight}% → ${next.judgeWeight}%；重新計算未公布結果`
        : action.type === "reopen"
          ? `${action.contestantId}：清除舊票，輪次 ${action.roundId}`
          : action.type === "publish"
            ? action.value
              ? "公布"
              : "取消公布"
            : action.type === "unlockWeights"
              ? "確認解鎖；下次套用須確認重新計算"
              : action.type,
  });
  return next;
}

export function result(state: Competition, contestantId: string) {
  const scores = state.scores.filter((s) => s.contestantId === contestantId);
  const round = state.rounds.find((r) => r.contestantId === contestantId);
  const votes = Object.values(round?.votes ?? {});
  const judge = scores.length
    ? scores.reduce((sum, s) => sum + s.total, 0) / scores.length
    : null;
  const audience = votes.length
    ? votes.reduce((sum, v) => sum + state.audiencePoints[v], 0) / votes.length
    : null;
  const ready =
    (state.judgeWeight === 0 ||
      (scores.length === state.judges.length &&
        scores.every((s) => s.rubric !== null))) &&
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
