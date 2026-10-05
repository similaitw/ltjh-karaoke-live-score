"use client";
import Link from "next/link";
import { useState } from "react";
import { useCompetition } from "@/components/competition-provider";
import { Scoreboard } from "@/components/scoreboard";
import { AdminSession } from "@/components/admin-session";
import { RUBRIC, type Answer, type Action } from "@/lib/domain";
import { CARD_COUNT } from "@/lib/card-config";

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
        {[100, 70, 50, 30, 0].map((n) => (
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
  return (
    <AdminSession>
      <AdminControls />
    </AdminSession>
  );
}

function AdminControls() {
  const { state, send, busy, ready } = useCompetition();
  const round = state.rounds.find(
    (r) => r.contestantId === state.activeContestantId,
  );
  const [confirm, setConfirm] = useState(false);
  const disabled = busy || !ready || state.published;
  const [pending, setPending] = useState<{
    action: Action;
    message: string;
  } | null>(null);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">BACKSTAGE / CONTROL ROOM</p>
        <h1>
          賽事控制<span className="heading-dot">.</span>
        </h1>
        <p>調整舞台節奏，讓每一個環節同步發生。</p>
      </div>
      {pending && (
        <section className="panel" role="alertdialog" aria-label="確認操作">
          <p>{pending.message}</p>
          <button
            className="button dark"
            disabled={busy}
            onClick={async () => {
              if (await send(pending.action)) setPending(null);
            }}
          >
            確認執行
          </button>{" "}
          <button className="button outline" onClick={() => setPending(null)}>
            取消操作
          </button>
        </section>
      )}
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
              setPending(null);
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
              <small> / {CARD_COUNT} 票</small>
            </strong>
          </div>
          {round && (
            <button
              className="button outline"
              disabled={disabled}
              onClick={() =>
                setPending({
                  action: {
                    type: "reopen",
                    contestantId: state.activeContestantId,
                    roundId: crypto.randomUUID(),
                    confirmed: true,
                    expectedRevision: state.revision,
                  },
                  message:
                    "重新開票會清除這位選手本輪所有觀眾票，建立空白新輪次。確定繼續？",
                })
              }
            >
              重新開票／清除本輪
            </button>
          )}
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
            disabled={disabled || state.weightsLocked}
            save={(value) => {
              if (state.started)
                setPending({
                  action: {
                    type: "weight",
                    value,
                    confirmed: true,
                    expectedRevision: state.revision,
                  },
                  message: `確認將權重改為 ${value}/${100 - value}？所有未公布成績會重新計算，套用後再次鎖定。`,
                });
              else void send({ type: "weight", value });
            }}
          />
          {state.weightsLocked && (
            <button
              className="button outline"
              disabled={disabled}
              onClick={() =>
                setPending({
                  action: {
                    type: "unlockWeights",
                    confirmed: true,
                    expectedRevision: state.revision,
                  },
                  message:
                    "比賽已開始。確定解鎖權重？後續套用新權重會再次要求確認，並重新計算未公布成績。",
                })
              }
            >
              解鎖權重
            </button>
          )}
          <form
            key={JSON.stringify(state.audiencePoints)}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const points = Object.fromEntries(
                (["A", "B", "C", "D"] as Answer[]).map((answer) => [
                  answer,
                  Number(data.get(answer)),
                ]),
              ) as Record<Answer, number>;
              void send({ type: "points", points });
            }}
          >
            <h3>觀眾答案分數</h3>
            <p className="fine">開賽前可調整；首次開票或評審送分後鎖定。</p>
            {(["A", "B", "C", "D"] as Answer[]).map((answer) => (
              <label key={answer}>
                {answer} 分數
                <input
                  name={answer}
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  required
                  defaultValue={state.audiencePoints[answer]}
                  disabled={disabled || state.started}
                />
              </label>
            ))}
            <button
              className="button dark"
              disabled={disabled || state.started}
            >
              儲存觀眾分數
            </button>
          </form>
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
            onClick={() => {
              if (state.published)
                setPending({
                  action: {
                    type: "publish",
                    value: false,
                    confirmed: true,
                    expectedRevision: state.revision,
                  },
                  message:
                    "確定取消正式公布？成績將回到暫定狀態，之後才能修改或重新開票。",
                });
              else void send({ type: "publish", value: true });
            }}
          >
            {state.published ? "取消公布，繼續編輯" : "公布最終成績"}
          </button>
        </div>
        <Scoreboard />
        <p className="fine muted">
          公布前需完成所有有權重的項目；公布後凍結評分、圖卡及權重。
        </p>
      </section>
      <section className="panel">
        <h2>評審分項明細</h2>
        {state.contestants.map((contestant) => (
          <details key={contestant.id}>
            <summary>{contestant.name}</summary>
            {state.judges.map((judge) => {
              const score = state.scores.find(
                (s) =>
                  s.contestantId === contestant.id && s.judgeId === judge.id,
              );
              return (
                <p key={judge.id}>
                  {judge.name}：
                  {score ? (
                    <>
                      {score.rubric
                        ? RUBRIC.map(
                            (item) =>
                              `${item.label} ${score.rubric![item.key]}/${item.max}`,
                          ).join(" · ")
                        : "舊資料待補五項評分"}{" "}
                      · 總分 {score.total}/100
                    </>
                  ) : (
                    "尚未送出"
                  )}
                </p>
              );
            })}
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>操作紀錄</h2>
        {state.events
          .slice(-20)
          .reverse()
          .map((event) => (
            <p key={event.revision}>
              #{event.revision} · {event.detail}
            </p>
          ))}
      </section>
    </>
  );
}
