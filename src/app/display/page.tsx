"use client";
import { useCompetition } from "@/components/competition-provider";
import { Scoreboard } from "@/components/scoreboard";
export default function Display() {
  const { state } = useCompetition();
  const active = state.contestants.find(
    (c) => c.id === state.activeContestantId,
  )!;
  const round = state.rounds.find((r) => r.contestantId === active.id);
  return (
    <>
      <div className="display-heading">
        <div>
          <p className="eyebrow">LUODONG / LIVE SCOREBOARD</p>
          <h1>
            {state.published ? "今晚的聲音，值得掌聲。" : "好聲音，正在發生。"}
          </h1>
        </div>
        <button
          className="button outline"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else
              void document.documentElement.requestFullscreen().catch(() => {});
          }}
        >
          切換全螢幕 ⛶
        </button>
      </div>
      <div className="on-air">
        <div>
          <span className="badge">
            {state.published
              ? "正式成績"
              : round?.status === "open"
                ? "觀眾投票中"
                : "現場進行中"}
          </span>
          <h2>
            {active.name}
            <span>《{active.song}》</span>
          </h2>
        </div>
        <div className="on-air-count mono">
          {Object.keys(round?.votes ?? {}).length}
          <small> / 40 票</small>
        </div>
      </div>
      <Scoreboard stage />
      <div className="display-bottom">
        <span>
          評審 {state.judgeWeight}% / 觀眾 {100 - state.judgeWeight}%
        </span>
        <span>
          {state.published ? "FINAL RESULTS" : "暫定排名・以正式公布為準"}
        </span>
      </div>
    </>
  );
}
