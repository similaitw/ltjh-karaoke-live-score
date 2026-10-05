"use client";
import { useState } from "react";
import { useCompetition } from "@/components/competition-provider";
import { RUBRIC, rubricTotal, type Rubric, type Score } from "@/lib/domain";

function RubricForm({
  saved,
  disabled,
  submit,
}: {
  saved?: Score;
  disabled: boolean;
  submit: (rubric: Rubric) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<keyof Rubric, string>>(
    () =>
      Object.fromEntries(
        RUBRIC.map((item) => [
          item.key,
          saved?.rubric?.[item.key]?.toString() ?? "",
        ]),
      ) as Record<keyof Rubric, string>,
  );
  const rubric = Object.fromEntries(
    RUBRIC.map((item) => [item.key, Number(values[item.key])]),
  ) as Rubric;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await submit(rubric);
      }}
    >
      {RUBRIC.map((item) => (
        <label key={item.key} htmlFor={item.key}>
          {item.label}（上限 {item.max}）
          <input
            id={item.key}
            name={item.key}
            type="number"
            min={0}
            max={item.max}
            step="0.1"
            required
            value={values[item.key]}
            disabled={disabled}
            onChange={(event) =>
              setValues({ ...values, [item.key]: event.target.value })
            }
          />
        </label>
      ))}
      <p>
        總分 <output aria-label="評審總分">{rubricTotal(rubric)}</output> / 100
      </p>
      <button className="button primary" disabled={disabled}>
        {saved ? "更新評分" : "送出評分"} ↗
      </button>
    </form>
  );
}

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
        <p>五項評分自動合計，滿分 100；每項不得超過標示上限。</p>
      </div>
      {state.judgeWeight === 0 && (
        <p className="notice">目前為 0/100 全觀眾模式，可略過評審流程。</p>
      )}
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
          <RubricForm
            key={`${judgeId}-${contestantId}-${JSON.stringify(saved)}`}
            saved={saved}
            disabled={
              busy || !ready || state.published || state.judgeWeight === 0
            }
            submit={async (rubric) => {
              if (await send({ type: "score", judgeId, contestantId, rubric }))
                setMessage("評分已儲存，可再次送出修改。");
            }}
          />
          <p role="status">{message}</p>
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
          <p>
            {saved
              ? `你的已存分數：${saved.total}${saved.rubric ? "" : "（舊資料待補五項評分）"}`
              : "你的評分尚未送出"}
          </p>
          <small>
            評分項目：音準、節奏、歌唱技巧、情感表達、舞台表現。
            <br />
            每位評審在總分中佔相同權重。
          </small>
        </aside>
      </div>
    </>
  );
}
