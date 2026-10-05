import type { Competition } from "./domain";

export function mockCompetition(): Competition {
  return {
    id: "luodong-live",
    title: "羅東國中・卡拉之聲",
    revision: 0,
    judgeWeight: 70,
    activeContestantId: "c1",
    published: false,
    contestants: [
      { id: "c1", name: "林語晴", song: "小幸運", className: "七年一班" },
      { id: "c2", name: "陳奕辰", song: "那些年", className: "八年三班" },
      { id: "c3", name: "黃以安", song: "稻香", className: "七年五班" },
      {
        id: "c4",
        name: "吳品妍",
        song: "夜空中最亮的星",
        className: "八年二班",
      },
    ],
    judges: [
      { id: "j1", name: "音樂老師" },
      { id: "j2", name: "社團老師" },
      { id: "j3", name: "特邀評審" },
    ],
    scores: ["c2", "c3", "c4"].flatMap((contestantId, i) =>
      ["j1", "j2", "j3"].map((judgeId, j) => ({
        contestantId,
        judgeId,
        value: 82 + i * 3 + j,
      })),
    ),
    rounds: ["c2", "c3", "c4"].map((contestantId, i) => ({
      id: `round-${contestantId}`,
      contestantId,
      status: "locked",
      votes: Object.fromEntries(
        Array.from({ length: 20 }, (_, n) => [
          String(n),
          n % 4 <= i ? "A" : "B",
        ]),
      ),
    })),
  };
}
