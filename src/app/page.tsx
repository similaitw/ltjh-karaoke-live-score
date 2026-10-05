"use client";
import Link from "next/link";
import { useCompetition } from "@/components/competition-provider";
import { Scoreboard } from "@/components/scoreboard";

export default function Home() {
  const { state } = useCompetition();
  const active = state.contestants.find(
    (c) => c.id === state.activeContestantId,
  )!;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">LTJH KARAOKE CLUB / LIVE SESSION</p>
          <h1>
            今天，
            <br />
            舞台是<span>你的。</span>
          </h1>
          <p className="hero-copy">
            一首歌，一次勇敢。
            <br />
            用歌聲站上舞台，用圖卡為喜歡的表演喝采。
          </p>
          <div className="actions">
            <Link className="button primary" href="/admin">
              進入賽事控制 <span>↗</span>
            </Link>
            <Link className="text-link" href="/display">
              開啟現場大螢幕 →
            </Link>
          </div>
        </div>
        <div className="stage-poster">
          <div className="poster-top mono">
            <span>ON THE STAGE</span>
            <span>● LIVE</span>
          </div>
          <div className="vinyl">
            <div className="vinyl-label">
              <span>羅東</span>
              <strong>卡拉之聲</strong>
              <span>VOL. 01</span>
            </div>
          </div>
          <div className="poster-bottom">
            <span>現在演出</span>
            <h2>
              {active.name}
              <small>《{active.song}》</small>
            </h2>
            <span className="mono">
              {active.className} / 0
              {state.contestants.findIndex((c) => c.id === active.id) + 1}
            </span>
          </div>
        </div>
      </section>
      <section className="quick-links">
        <Link href="/judge">
          <span className="mono">01 / JUDGE</span>
          <h3>每一分，都有份量 ↗</h3>
          <p>評審入席，為現場表現給分。</p>
        </Link>
        <Link href="/scan">
          <span className="mono">02 / SCAN</span>
          <h3>舉起你的聲音 ↗</h3>
          <p>開啟相機，累積每張圖卡的選擇。</p>
        </Link>
        <Link href="/cards">
          <span className="mono">03 / CARDS</span>
          <h3>把支持，拿在手上 ↗</h3>
          <p>1–40 張方向圖卡，A4 每頁 4 張。</p>
        </Link>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE LIVE BOARD</p>
            <h2>即時成績</h2>
          </div>
          <span className="badge">
            {state.published ? "正式公布" : "進行中・暫定"}
          </span>
        </div>
        <Scoreboard />
      </section>
    </>
  );
}
