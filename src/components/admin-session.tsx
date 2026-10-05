"use client";
import { useEffect, useState } from "react";
import { remote } from "./competition-provider";

export function AdminSession({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!remote) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/session", {
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (active) {
          setAuthenticated(body.authenticated);
          setLoaded(true);
        }
      } catch (error) {
        if (active) {
          setAuthenticated(false);
          setError((error as Error).message);
          setLoaded(true);
        }
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  if (!remote) return <>{children}</>;
  if (!loaded) return <p role="status">正在確認管理登入…</p>;
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {authenticated ? (
        <>
          <div className="actions no-print">
            <span>管理者已登入</span>
            <button
              className="button outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const response = await fetch("/api/admin/session", {
                    method: "DELETE",
                  });
                  const body = await response.json();
                  if (!response.ok) throw new Error(body.error);
                  setAuthenticated(false);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              登出
            </button>
          </div>
          {children}
        </>
      ) : (
        <section className="panel">
          <h1>管理者登入</h1>
          <p>輸入管理密碼後，控制台與掃描頁共用登入狀態。</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const password = new FormData(form).get("password");
              form.reset();
              setBusy(true);
              setError("");
              try {
                const response = await fetch("/api/admin/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password }),
                });
                const body = await response.json();
                if (!response.ok) throw new Error(body.error);
                setAuthenticated(true);
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="admin-password">管理密碼</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={512}
            />
            <button className="button primary" disabled={busy}>
              登入
            </button>
          </form>
        </section>
      )}
    </>
  );
}
