"use client";
import { useState } from "react";
import { useCompetition } from "@/components/competition-provider";

export default function Judge() {
  const { state, send, busy, ready } = useCompetition();
  const [judgeId, setJudgeId] = useState("j1");
  const [contestantId, setContestantId] = useState("c1");
  const [message, setMessage] = useState("");
  const contestant = state.contestants.find((c) => c.id === contestantId)!;
  const saved = state.scores.find(
    (s) => s.judgeId === judgeId && s.contestantId === contestantId,
  );
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">LISTEN CLOSELY / JUDGE DESK</p>
        <h1>
          每一分，都有份量<span className="heading-dot">.</span>
        </h1>
        <p>聽見勇氣，也聽見細節。請給予 0–100 分的整體評分。</p>
      </div>
      <div className="two-column">
        <section className="panel">
          <label htmlFor="judge">評審身分</label>
          <select
            id="judge"
            value={judgeId}
            onChange={(e) => {
              setJudgeId(e.target.value);
              setMessage("");
            }}
          >
            {state.judges.map((j) => (
              <option value={j.id} key={j.id}>
                {j.name}
              </option>
            ))}
          </select>
          <label htmlFor="contestant">評分參賽者</label>
          <select
            id="contestant"
            value={contestantId}
            onChange={(e) => {
              setContestantId(e.target.value);
              setMessage("");
            }}
          >
            {state.contestants.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name} — {c.song}
              </option>
            ))}
          </select>
          <form
            key={`${judgeId}-${contestantId}-${saved?.value}`}
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              if (
                await send({
                  type: "score",
                  judgeId,
                  contestantId,
                  value: Number(data.get("score")),
                })
              )
                setMessage("評分已儲存，可再次送出修改。");
            }}
          >
            <label htmlFor="score">整體分數</label>
            <div className="score-input">
              <input
                id="score"
                name="score"
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                defaultValue={saved?.value ?? ""}
                placeholder="—"
                disabled={state.published}
              />
              <span>/ 100</span>
            </div>
            <button
              className="button primary"
              disabled={busy || !ready || state.published}
            >
              {saved ? "更新評分" : "送出評分"} ↗
            </button>
            <p role="status">{message}</p>
          </form>
        </section>
        <aside className="judge-poster">
          <p className="eyebrow">YOU ARE LISTENING TO</p>
          <span className="huge-number mono">
            0{state.contestants.findIndex((c) => c.id === contestantId) + 1}
          </span>
          <h2>{contestant.name}</h2>
          <h3>《{contestant.song}》</h3>
          <p>{contestant.className}</p>
          <div className="divider" />
          <p>{saved ? `你的已存分數：${saved.value}` : "你的評分尚未送出"}</p>
          <small>
            評分參考：音準、節奏、情感及舞台表現。
            <br />
            每位評審在總分中佔相同權重。
          </small>
        </aside>
      </div>
    </>
  );
}
