"use client";
import Link from "next/link";
import { useState } from "react";
import { useCompetition } from "@/components/competition-provider";
import { Scoreboard } from "@/components/scoreboard";

function Weights({
  initial,
  disabled,
  save,
}: {
  initial: number;
  disabled: boolean;
  save: (value: number) => void;
}) {
  const [weight, setWeight] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(weight);
      }}
    >
      <div className="weight-values">
        <span>
          評審 <strong>{weight}%</strong>
        </span>
        <span>
          觀眾 <strong>{100 - weight}%</strong>
        </span>
      </div>
      <label htmlFor="weight">評分權重</label>
      <input
        id="weight"
        type="range"
        min="0"
        max="100"
        value={weight}
        disabled={disabled}
        onChange={(e) => setWeight(Number(e.target.value))}
      />
      <div className="presets">
        {[100, 70, 50, 0].map((n) => (
          <button
            type="button"
            className={weight === n ? "selected" : ""}
            key={n}
            disabled={disabled}
            onClick={() => {
              setWeight(n);
              save(n);
            }}
          >
            {n} / {100 - n}
          </button>
        ))}
      </div>
      <button className="button dark" disabled={disabled || weight === initial}>
        套用權重
      </button>
      <p className="fine muted">
        總分 = 評審平均 × 評審權重 + 觀眾平均 ×
        觀眾權重。零權重項目不影響完成狀態。
      </p>
    </form>
  );
}

export default function Admin() {
  const { state, send, busy, ready } = useCompetition();
  const round = state.rounds.find(
    (r) => r.contestantId === state.activeContestantId,
  );
  const [confirm, setConfirm] = useState(false);
  const disabled = busy || !ready || state.published;
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">BACKSTAGE / CONTROL ROOM</p>
        <h1>
          賽事控制<span className="heading-dot">.</span>
        </h1>
        <p>調整舞台節奏，讓每一個環節同步發生。</p>
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <h2>現在演出</h2>
            <span className="mono">01 / STAGE</span>
          </div>
          <label htmlFor="active">選擇參賽者</label>
          <select
            id="active"
            value={state.activeContestantId}
            disabled={disabled || round?.status === "open"}
            onChange={(e) => {
              setConfirm(false);
              void send({ type: "select", contestantId: e.target.value });
            }}
          >
            {state.contestants.map((c, i) => (
              <option value={c.id} key={c.id}>
                {i + 1}. {c.name} — {c.song}
              </option>
            ))}
          </select>
          <div className="round-status">
            <span className="badge">
              {round
                ? round.status === "open"
                  ? "觀眾投票中"
                  : "已鎖票"
                : "尚未開放投票"}
            </span>
            <strong className="mono">
              {Object.keys(round?.votes ?? {}).length}
              <small> / 20 票</small>
            </strong>
          </div>
          <div className="actions">
            <button
              className="button primary"
              disabled={disabled || !!round}
              onClick={() =>
                void send({
                  type: "open",
                  contestantId: state.activeContestantId,
                  roundId: crypto.randomUUID(),
                })
              }
            >
              開放觀眾投票
            </button>
            <Link className="button outline" href="/scan">
              前往掃描 →
            </Link>
          </div>
          {round?.status === "open" && (
            <div className="lock-box">
              <p>完成掃描後鎖票。鎖票後，此輪圖卡答案不可再修改。</p>
              <button
                className="button dark"
                disabled={disabled}
                onClick={async () => {
                  if (!confirm) {
                    setConfirm(true);
                    return;
                  }
                  if (await send({ type: "lock", roundId: round.id }))
                    setConfirm(false);
                }}
              >
                {confirm ? "確認鎖票" : "完成並鎖票"}
              </button>
              {confirm && (
                <button className="text-link" onClick={() => setConfirm(false)}>
                  取消
                </button>
              )}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>分數怎麼算</h2>
            <span className="mono">02 / MIX</span>
          </div>
          <Weights
            key={state.judgeWeight}
            initial={state.judgeWeight}
            disabled={disabled}
            save={(value) => {
              void send({ type: "weight", value });
            }}
          />
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RESULTS</p>
            <h2>{state.published ? "成績已正式公布" : "目前成績・尚未公布"}</h2>
          </div>
          <button
            className="button dark"
            disabled={busy || !ready}
            onClick={() =>
              void send({ type: "publish", value: !state.published })
            }
          >
            {state.published ? "取消公布，繼續編輯" : "公布最終成績"}
          </button>
        </div>
        <Scoreboard />
        <p className="fine muted">
          公布前需完成所有有權重的項目；公布後凍結評分、圖卡及權重。
        </p>
      </section>
    </>
  );
}
