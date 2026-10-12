/** 全局数据 + SSE 订阅 */
import * as React from "react";

export function useRadarState() {
  const [state, setState] = React.useState({
    keywords: [], signals: [], hotspots: [], schedule: [], system: {},
  });
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState(await res.json());
    } catch {
      /* 服务重启窗口，静默等待 SSE 重连 */
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    es.addEventListener("signal", () => refresh());
    es.addEventListener("hotspots", () => refresh());
    es.addEventListener("schedule", () => refresh());
    es.addEventListener("system_alert", () => refresh());
    es.addEventListener("provider_error", () => refresh());
    const tick = setInterval(refresh, 60000); // SSE 漏事件兜底
    return () => { es.close(); clearInterval(tick); };
  }, [refresh]);

  return { state, refresh };
}

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ---------- 展示工具 ---------- */
export function timeAgo(unix) {
  if (!unix) return "时间未知";
  const d = Date.now() / 1000 - unix;
  if (d < 60) return "刚刚";
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} 天前`;
  return new Date(unix * 1000).toLocaleDateString("zh-CN");
}

export function fmtIn(sec) {
  if (sec <= 0) return "即将";
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分`;
  return `${Math.floor(sec / 3600)} 时`;
}
