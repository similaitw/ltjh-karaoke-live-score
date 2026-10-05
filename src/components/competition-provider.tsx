"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@supabase/supabase-js";
import { applyAction, type Action, type Competition } from "@/lib/domain";
import { mockCompetition } from "@/lib/mock";

const KEY = "ltjh-competition-v2";
export const remote = process.env.NEXT_PUBLIC_DATA_MODE === "supabase";
type Context = {
  state: Competition;
  ready: boolean;
  error: string;
  connection: string;
  busy: boolean;
  token: string;
  setToken: (token: string) => void;
  send: (action: Action) => Promise<boolean>;
};
const CompetitionContext = createContext<Context | null>(null);

async function fetchState() {
  const response = await fetch("/api/competition", {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body as Competition;
}

export function CompetitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState(mockCompetition);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [connection, setConnection] = useState(
    remote ? "正在連線" : "本機示範",
  );
  const [busy, setBusy] = useState(false);
  const [token, updateToken] = useState("");
  const queue = useRef(Promise.resolve());
  const current = useRef(state);
  const accept = useCallback((next: Competition) => {
    if (next.revision >= current.current.revision) {
      current.current = next;
      setState(next);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const next = remote
          ? await fetchState()
          : JSON.parse(
              localStorage.getItem(KEY) ?? JSON.stringify(mockCompetition()),
            );
        if (!disposed) {
          accept(next);
          setReady(true);
          setSyncError("");
        }
      } catch (error) {
        if (!disposed) setSyncError(`同步失敗：${(error as Error).message}`);
      }
    }
    queueMicrotask(() => {
      if (!disposed) {
        try {
          updateToken(sessionStorage.getItem("ltjh-judge-token") ?? "");
        } catch {
          setError("瀏覽器無法保存操作代碼，請允許網站儲存空間。");
        }
      }
    });
    void refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    const poll = window.setInterval(refresh, remote ? 5000 : 2000);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const client = remote && url && key ? createClient(url, key) : null;
    const channel = client
      ?.channel("competition-live")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "competitions",
          filter: "id=eq.luodong-live",
        },
        () => {
          void refresh();
        },
      )
      .subscribe((status) => {
        if (!disposed)
          setConnection(
            status === "SUBSCRIBED" ? "即時連線" : "重連中・每 5 秒同步",
          );
      });
    if (remote && !client)
      queueMicrotask(() => {
        if (!disposed) setConnection("未設定 Realtime・每 5 秒同步");
      });
    return () => {
      disposed = true;
      window.clearInterval(poll);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [accept]);

  function setToken(value: string) {
    updateToken(value);
    try {
      sessionStorage.setItem("ltjh-judge-token", value);
    } catch {
      setError("操作代碼暫存失敗；重新整理後需再輸入。");
    }
  }

  function send(action: Action): Promise<boolean> {
    let success = false;
    const task = queue.current.then(async () => {
      setBusy(true);
      setError("");
      try {
        if (!ready) throw new Error("資料尚未載入");
        if (remote) {
          const response = await fetch("/api/competition", {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            headers: {
              "Content-Type": "application/json",
              ...(action.type === "score" && token
                ? { Authorization: `Bearer ${token}` }
                : {}),
            },
            body: JSON.stringify(action),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          accept(body);
        } else {
          const mutate = () => {
            const previous = JSON.parse(
              localStorage.getItem(KEY) ?? JSON.stringify(mockCompetition()),
            ) as Competition;
            const next = applyAction(previous, action, { role: "admin" });
            localStorage.setItem(KEY, JSON.stringify(next));
            accept(next);
          };
          if (navigator.locks) await navigator.locks.request(KEY, mutate);
          else mutate();
        }
        success = true;
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setBusy(false);
      }
    });
    queue.current = task;
    return task.then(() => success);
  }

  return (
    <CompetitionContext.Provider
      value={{
        state,
        ready,
        error: error || syncError,
        connection,
        busy,
        token,
        setToken,
        send,
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetition() {
  const context = useContext(CompetitionContext);
  if (!context) throw new Error("Missing CompetitionProvider");
  return context;
}
