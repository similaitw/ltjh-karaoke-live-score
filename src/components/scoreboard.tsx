"use client";
import { ranking } from "@/lib/domain";
import { useCompetition } from "./competition-provider";

export function Scoreboard({ stage = false }: { stage?: boolean }) {
  const { state } = useCompetition();
  return (
    <div className={`scoreboard ${stage ? "stage-scores" : ""}`}>
      <div className="score-head">
        <span>排名 / 參賽者</span>
        <span>評審</span>
        <span>觀眾</span>
        <span>總分</span>
      </div>
      {ranking(state).map((row) => (
        <div className="score-row" key={row.id} data-testid={`score-${row.id}`}>
          <div className="performer">
            <span className="rank mono">
              {row.rank ? String(row.rank).padStart(2, "0") : "—"}
            </span>
            <div>
              <strong>{row.name}</strong>
              <small>
                {row.className} · {row.song}
              </small>
            </div>
          </div>
          <span>
            {row.judge?.toFixed(1) ?? "—"}
            <small>
              {row.judgeCount}/{state.judges.length} 位
            </small>
          </span>
          <span>
            {row.audience?.toFixed(1) ?? "—"}
            <small>{row.voteCount} 票</small>
          </span>
          <strong className="total mono">
            {row.total?.toFixed(2) ?? "待完成"}
          </strong>
        </div>
      ))}
      <p className="muted fine">
        同分並列。未完成必要評分的參賽者暫不排名；觀眾分數於鎖票後納入總分。
      </p>
    </div>
  );
}
