"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CameraScanner } from "@/components/camera-scanner";
import { remote, useCompetition } from "@/components/competition-provider";
import { type Detection } from "@/lib/markers";
import { ANSWER_POINTS, type Answer } from "@/lib/domain";

export default function Scan() {
  const { state, send, busy, ready } = useCompetition();
  const [confirm, setConfirm] = useState(false);
  const inFlight = useRef(false);
  const round = state.rounds.find(
    (r) => r.contestantId === state.activeContestantId,
  );
  const active = state.contestants.find(
    (c) => c.id === state.activeContestantId,
  )!;
  const locked = !round || round.status === "locked" || state.published;
  async function detected(detections: Detection[]) {
    if (locked || inFlight.current || !round) return;
    const changed = detections.filter(
      (d) => round.votes[d.markerId] !== d.answer,
    );
    if (!changed.length) return;
    inFlight.current = true;
    try {
      if (
        !(await send({
          type: "votes",
          roundId: round.id,
          votes: changed.map((d) => ({
            markerId: d.markerId,
            answer: d.answer,
          })),
        }))
      )
        throw new Error("同步失敗");
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">AUDIENCE / LIVE SCANNER</p>
        <h1>
          舉起你的聲音<span className="heading-dot">.</span>
        </h1>
        <p>
          {active.name} ·《{active.song}》— 掃描不同區域，票數會持續累積。
        </p>
      </div>
      {locked && (
        <p className="notice">
          {round ? "此輪已鎖票，不能再修改答案。" : "尚未開放投票。"}{" "}
          <Link href="/admin">返回賽事控制 →</Link>
        </p>
      )}
      <div className="scan-layout">
        <CameraScanner
          key={`${round?.id}-${locked}`}
          onDetected={detected}
          disabled={locked || !ready}
        />
        <aside className="panel vote-panel">
          <p className="eyebrow">COLLECTED VOICES</p>
          <div className="vote-total mono">
            {Object.keys(round?.votes ?? {}).length}
            <span>/ 20</span>
          </div>
          <p>
            {round?.status === "locked"
              ? "已完成鎖票"
              : "已收集・同一卡只計一票"}
          </p>
          <div className="vote-bars">
            {(["A", "B", "C", "D"] as Answer[]).map((answer) => (
              <div key={answer}>
                <span>
                  {answer} <small>{ANSWER_POINTS[answer]} 分</small>
                </span>
                <meter
                  min="0"
                  max="20"
                  value={
                    Object.values(round?.votes ?? {}).filter(
                      (v) => v === answer,
                    ).length
                  }
                  aria-label={`${answer} 票數`}
                />
                <strong>
                  {
                    Object.values(round?.votes ?? {}).filter(
                      (v) => v === answer,
                    ).length
                  }
                </strong>
              </div>
            ))}
          </div>
          <button
            className="button dark full"
            disabled={locked || busy || !ready}
            onClick={async () => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              if (round && (await send({ type: "lock", roundId: round.id })))
                setConfirm(false);
            }}
          >
            {confirm ? "確認鎖票" : "完成並鎖票"}
          </button>
          {confirm && !locked && (
            <>
              <p className="fine">鎖票後不可修改此輪答案。</p>
              <button className="text-link" onClick={() => setConfirm(false)}>
                繼續掃描
              </button>
            </>
          )}
        </aside>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>圖卡收集狀態</h2>
          <span className="fine">A / B / C / D 朝上選答案</span>
        </div>
        <div className="vote-grid">
          {Array.from({ length: 20 }, (_, id) => (
            <div key={id} className={round?.votes[id] ? "collected" : ""}>
              <span>卡 {String(id + 1).padStart(2, "0")}</span>
              <strong>{round?.votes[id] ?? "—"}</strong>
              {round?.votes[id] && (
                <select
                  aria-label={`修改卡 ${id + 1} 答案`}
                  value={round.votes[id]}
                  disabled={locked || busy}
                  onChange={(e) =>
                    void send({
                      type: "votes",
                      roundId: round.id,
                      votes: [
                        { markerId: id, answer: e.target.value as Answer },
                      ],
                    })
                  }
                >
                  {["A", "B", "C", "D"].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        <p className="fine muted">
          重新掃到同一卡時以最新穩定方向更新，也可在此人工更正。圖卡編號 01–20
          對應 marker ID 0–19。
        </p>
        {!remote && (
          <div className="demo-controls">
            <p className="fine">
              無相機示範：加入 20
              張模擬票，體驗去重、改票與鎖票。此按鈕直接產生票，不是相機驗證。
            </p>
            <button
              className="button outline"
              disabled={locked || busy || !ready}
              onClick={() =>
                round &&
                void send({
                  type: "votes",
                  roundId: round.id,
                  votes: Array.from({ length: 20 }, (_, markerId) => ({
                    markerId,
                    answer: (["A", "B", "C", "D"] as Answer[])[markerId % 4],
                  })),
                })
              }
            >
              加入 20 張示範票
            </button>
          </div>
        )}
      </section>
    </>
  );
}
