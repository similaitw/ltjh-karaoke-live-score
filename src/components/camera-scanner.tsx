"use client";
import { useEffect, useRef, useState } from "react";
import { createDecoder, StableDetections, type Detection } from "@/lib/markers";

export function CameraScanner({
  onDetected,
  disabled,
}: {
  onDetected: (detections: Detection[]) => Promise<void>;
  disabled: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const handler = useRef(onDetected);
  const isDisabled = useRef(disabled);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  useEffect(() => {
    handler.current = onDetected;
    isDisabled.current = disabled;
  }, [onDetected, disabled]);

  function release() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function stop() {
    release();
    setRunning(false);
    setStarting(false);
  }
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        release();
        setRunning(false);
        setStarting(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      release();
    };
  }, []);

  async function start() {
    stop();
    setError("");
    setStarting(true);
    const session = generation.current;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("相機需要 HTTPS 或 localhost，請使用安全網址開啟。");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (generation.current !== session) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const cameras = await navigator.mediaDevices.enumerateDevices();
      if (generation.current !== session) return;
      setDevices(cameras.filter((d) => d.kind === "videoinput"));
      setDeviceId(media.getVideoTracks()[0].getSettings().deviceId ?? "");
      video.current!.srcObject = media;
      await video.current!.play();
      if (generation.current !== session) return;
      media.getVideoTracks()[0].addEventListener("ended", () => {
        if (generation.current === session) {
          stop();
          setError("相機已中斷，請重新啟動。");
        }
      });
      setRunning(true);
      setStarting(false);
      const decode = createDecoder();
      const stable = new StableDetections();
      const tick = async () => {
        if (generation.current !== session) return;
        if (isDisabled.current) {
          stop();
          return;
        }
        try {
          const v = video.current,
            c = canvas.current;
          if (v && c && v.readyState >= 2 && v.videoWidth) {
            c.width = Math.min(v.videoWidth, 960);
            c.height = Math.round((v.videoHeight * c.width) / v.videoWidth);
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const detections = decode(
              ctx.getImageData(0, 0, c.width, c.height),
            );
            setCount(detections.length);
            for (const d of detections) {
              ctx.strokeStyle = "#d8ff3e";
              ctx.lineWidth = 4;
              ctx.beginPath();
              d.corners.forEach((p, i) =>
                i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
              );
              ctx.closePath();
              ctx.stroke();
              ctx.fillStyle = "#d8ff3e";
              ctx.font = "bold 24px sans-serif";
              ctx.fillText(
                `${d.markerId + 1}: ${d.answer}`,
                d.corners[0].x,
                Math.max(24, d.corners[0].y - 8),
              );
            }
            const confirmed = stable.update(detections);
            if (confirmed.length && !isDisabled.current)
              await handler.current(confirmed);
          }
        } catch {
          stop();
          setError("影像處理或同步中斷，請重啟相機。");
          return;
        }
        if (generation.current === session)
          timer.current = setTimeout(tick, 140);
      };
      void tick();
    } catch (err) {
      if (generation.current !== session) return;
      stop();
      const e = err as Error;
      const messages: Record<string, string> = {
        NotAllowedError: "相機權限未開放。請在瀏覽器網站設定允許相機後重試。",
        NotFoundError: "找不到相機，請確認裝置具有可用相機。",
        NotReadableError: "相機正被其他程式使用，請關閉其他相機程式後重試。",
        OverconstrainedError: "選取的相機無法使用，請改選預設後置相機。",
      };
      setError(messages[e.name] ?? e.message);
    }
  }

  return (
    <div className="camera-panel">
      <div className="camera-view">
        <video ref={video} muted playsInline className="camera-source" />
        <canvas ref={canvas} aria-label="相機掃描影像" />
        {!running && (
          <div className="camera-empty">
            <span className="scan-icon">⌗</span>
            <h3>{starting ? "等待相機授權…" : "準備接收全場的聲音"}</h3>
            <p>開啟後置相機，將完整圖卡放入畫面。</p>
          </div>
        )}
        <div className="camera-meta mono">
          <span>{running ? "● SCANNING" : "CAMERA OFF"}</span>
          <span>本幀 {count} 張</span>
        </div>
      </div>
      <div className="camera-controls">
        <label>
          相機
          <select
            aria-label="相機"
            value={deviceId}
            onChange={(e) => {
              stop();
              setDeviceId(e.target.value);
            }}
            disabled={starting}
          >
            <option value="">預設後置相機</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `相機 ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          disabled={disabled || starting}
          onClick={() => {
            if (running) stop();
            else void start();
          }}
        >
          {running ? "停止相機" : "啟動相機"}
        </button>
        {starting && (
          <button className="button outline" onClick={stop}>
            取消啟動
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="fine muted">
        影像僅在此裝置處理，不上傳、不儲存。切換相機後請重新啟動；離開頁面或切至背景會停止相機。
      </p>
    </div>
  );
}
