"use client";
import { useState } from "react";
import {
  CARD_COUNT,
  DEFAULT_CARD_COUNT,
  CARDS_PER_PAGE,
  markerSvg,
} from "@/lib/markers";
import { useCompetition } from "@/components/competition-provider";

export default function Cards() {
  const [count, setCount] = useState(DEFAULT_CARD_COUNT);
  const { state } = useCompetition();
  const points = state.audiencePoints;
  return (
    <>
      <div className="page-heading no-print">
        <p className="eyebrow">HOLD IT UP / AUDIENCE CARDS</p>
        <h1>
          把支持，拿在手上<span className="heading-dot">.</span>
        </h1>
        <p>每人一張，讓想選的字母朝上。重複掃描不加票，轉動圖卡可以改票。</p>
        <label htmlFor="card-count">圖卡數量（1–{CARD_COUNT}）</label>
        <input
          id="card-count"
          type="number"
          min={1}
          max={CARD_COUNT}
          value={count}
          onChange={(event) => {
            setCount(
              Math.max(
                1,
                Math.min(CARD_COUNT, Math.trunc(Number(event.target.value))),
              ),
            );
          }}
        />
        <button className="button primary" onClick={() => window.print()}>
          列印 {count} 張圖卡 ↗
        </button>
        <p className="fine">
          A = {points.A} · B = {points.B} · C = {points.C} · D = {points.D}{" "}
          分。A4 直式、100% 比例、關閉頁首頁尾，每頁 4
          張。保留白邊，勿鏡像列印；管理者變更分數後請重新列印。
        </p>
      </div>
      <div className="cards-grid" data-cards-per-page={CARDS_PER_PAGE}>
        {Array.from(
          { length: Math.ceil(count / CARDS_PER_PAGE) },
          (_, sheet) => (
            <div className="cards-sheet" key={sheet}>
              {Array.from(
                {
                  length: Math.min(
                    CARDS_PER_PAGE,
                    count - sheet * CARDS_PER_PAGE,
                  ),
                },
                (_, index) => {
                  const id = sheet * CARDS_PER_PAGE + index;
                  return (
                    <article className="print-card" key={id}>
                      <header>
                        <span>卡拉之聲 / 觀眾投票</span>
                        <strong>卡 {String(id + 1).padStart(2, "0")}</strong>
                      </header>
                      <div className="marker-wrap">
                        <b className="answer a">A · {points.A}</b>
                        <b className="answer b">B · {points.B}</b>
                        <b className="answer c">C · {points.C}</b>
                        <b className="answer d">D · {points.D}</b>
                        <div
                          className="marker"
                          dangerouslySetInnerHTML={{ __html: markerSvg(id) }}
                        />
                      </div>
                      <p>
                        想選的字母朝上 ↑ <span className="mono">ID {id}</span>
                      </p>
                    </article>
                  );
                },
              )}
            </div>
          ),
        )}
      </div>
    </>
  );
}
