"use client";
import { CARD_COUNT, markerSvg } from "@/lib/markers";
export default function Cards() {
  return (
    <>
      <div className="page-heading no-print">
        <p className="eyebrow">HOLD IT UP / AUDIENCE CARDS</p>
        <h1>
          把支持，拿在手上<span className="heading-dot">.</span>
        </h1>
        <p>每人一張，讓想選的字母朝上。重複掃描不加票，轉動圖卡可以改票。</p>
        <button className="button primary" onClick={() => window.print()}>
          列印 20 張圖卡 ↗
        </button>
        <p className="fine">
          A = 100 · B = 80 · C = 60 · D = 40 分。A4 直式、100%
          比例、關閉頁首頁尾，每頁 2 張。保留白邊，勿鏡像列印。
        </p>
      </div>
      <div className="cards-grid">
        {Array.from({ length: CARD_COUNT }, (_, id) => (
          <article className="print-card" key={id}>
            <header>
              <span>卡拉之聲 / 觀眾投票</span>
              <strong>卡 {String(id + 1).padStart(2, "0")}</strong>
            </header>
            <div className="marker-wrap">
              <b className="answer a">A · 100</b>
              <b className="answer b">B · 80</b>
              <b className="answer c">C · 60</b>
              <b className="answer d">D · 40</b>
              <div
                className="marker"
                dangerouslySetInnerHTML={{ __html: markerSvg(id) }}
              />
            </div>
            <p>
              想選的字母朝上 ↑ <span className="mono">ID {id}</span>
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
