"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { remote, useCompetition } from "./competition-provider";

const links = [
  ["/", "活動首頁"],
  ["/admin", "賽事控制"],
  ["/judge", "評審席"],
  ["/scan", "圖卡掃描"],
  ["/display", "現場大螢幕"],
  ["/cards", "列印圖卡"],
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { connection, error, ready, token, setToken } = useCompetition();
  return (
    <div className={path === "/display" ? "app display-mode" : "app"}>
      <header className="masthead">
        <Link className="brand" href="/" aria-label="卡拉之聲首頁">
          <span className="brand-symbol">聲</span>
          <span>
            卡拉之聲<small>LUODONG JUNIOR HIGH</small>
          </span>
        </Link>
        <div className="live-tag">
          <span className="live-dot" />
          {connection}
          <span className="mono"> / M1.1</span>
        </div>
      </header>
      <nav aria-label="主要導覽">
        {links.map(([href, title]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
          >
            {title}
          </Link>
        ))}
      </nav>
      <main>
        {!remote && (
          <div className="mode-note">
            DEMO MODE{" "}
            <span>示範資料・同瀏覽器分頁同步。跨裝置請設定 Supabase。</span>
          </div>
        )}
        {!ready && (
          <p role="status" className="notice">
            正在載入競賽資料…
          </p>
        )}
        {remote && path === "/judge" && (
          <details className="access">
            <summary>操作代碼 {token ? "・已填入" : "・尚未填入"}</summary>
            <label>
              評審代碼
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                placeholder="由活動管理員提供"
              />
            </label>
            <small>僅保存在本分頁工作階段；評審代碼只能修改自己的分數。</small>
          </details>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {(ready || ["/cards", "/admin", "/scan"].includes(path)) && children}
      </main>
      <footer>
        <span>羅東國中卡拉社</span>
        <span className="mono">YOUR VOICE. OUR STAGE.</span>
        <span>讓每一個聲音，被聽見。</span>
      </footer>
    </div>
  );
}
