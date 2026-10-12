import * as React from "react";
import { SpotlightNew } from "@/components/aceternity/spotlight-new";
import { InfiniteMovingCards } from "@/components/aceternity/infinite-moving-cards";
import { RadarScope } from "@/components/RadarScope";
import { SignalStream } from "@/components/SignalStream";
import { HotspotBoard } from "@/components/HotspotBoard";
import { KeywordsPanel, SettingsPanel } from "@/components/Panels";
import { useRadarState, api, timeAgo } from "@/hooks/useRadarState";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "signals", label: "信号流" },
  { id: "hotspots", label: "热点榜" },
  { id: "keywords", label: "监控词" },
  { id: "settings", label: "设置" },
];

function Toasts({ toasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex max-w-[380px] flex-col gap-2.5">
      {toasts.map((t) => (
        <div key={t.id}
          className={cn(
            "rounded-xl border border-edge bg-panel/95 px-4 py-3 text-[13px] text-ink shadow-2xl backdrop-blur",
            t.level === "error" && "border-critical/40",
            t.level === "warn" && "border-heat/40",
            "animate-[flyIn_.3s_ease-out]",
          )}>
          <span dangerouslySetInnerHTML={{ __html: t.html }} />
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { state, refresh } = useRadarState();
  const { keywords, signals, hotspots, schedule, system } = state;
  const [tab, setTab] = React.useState("signals");
  const [showSuspect, setShowSuspect] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  const [unread, setUnread] = React.useState(0);
  const sigCount = React.useRef(0);

  const notify = React.useCallback((msg, level = "ok", ms = 5000) => {
    const html = String(msg).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const id = Math.random();
    setToasts((ts) => [...ts.slice(-3), { id, html, level }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), ms);
  }, []);

  /* 新信号：弹 toast + 标题闪烁（「第一时间」情绪） */
  React.useEffect(() => {
    const prev = sigCount.current;
    if (prev && signals.length > prev) {
      for (const s of signals.slice(0, signals.length - prev)) {
        notify(`◉ 新信号 [${s.keyword}] ${s.title.slice(0, 42)}`, "ok", 8000);
        setUnread((u) => u + 1);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`◉ 雷达捕获 [${s.keyword}]`, { body: `${s.title}\nAI 真实度 ${s.confidence}%`, tag: `sig-${s.id}` });
        }
      }
    }
    sigCount.current = signals.length;
  }, [signals, notify]);

  React.useEffect(() => {
    document.title = unread ? `(${unread}) 🔴 新信号 · AI 热点雷达站` : "AI 热点雷达站";
    const onFocus = () => setUnread(0);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [unread]);

  React.useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      const t = setTimeout(() => Notification.requestPermission(), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  /* 顶栏快讯 ticker：最新确认信号 */
  const tickerItems = signals.slice(0, 10).map((s) => ({
    keyword: s.keyword,
    title: s.title,
    url: s.url,
    timeLabel: timeAgo(s.foundAt),
    tone: s.confidence >= 85 ? "hot" : "normal",
  }));

  return (
    <div className="relative min-h-screen bg-void text-ink">
      {/* 全局网格底纹 */}
      <div className="bg-grid pointer-events-none fixed inset-0 opacity-70" />

      {/* ── 顶栏 + Spotlight 氛围 ── */}
      <header className="sticky top-0 z-50 border-b border-edge bg-void/85 backdrop-blur-md">
        <SpotlightNew className="!absolute" />
        <div className="relative mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className={cn("absolute h-full w-full rounded-full", system.openrouterReady ? "animate-ping-signal bg-signal" : "bg-critical")} />
              <span className={cn("relative h-2.5 w-2.5 rounded-full", system.openrouterReady ? "bg-signal" : "bg-critical")} />
            </span>
            <div>
              <h1 className="font-mono text-[15px] font-bold tracking-wide text-ink">AI 热点雷达站</h1>
              <p className="font-mono text-[9px] tracking-[0.28em] text-ink-faint">HOT SIGNAL DETECTION · v0.2</p>
            </div>
          </div>

          <nav className="order-3 flex w-full gap-1 md:order-none md:w-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 rounded-lg px-3.5 py-1.5 font-mono text-[12.5px] transition-all md:flex-none",
                  tab === t.id
                    ? "border border-signal/35 bg-signal/[0.07] text-signal"
                    : "border border-transparent text-ink-dim hover:border-edge hover:text-ink",
                )}>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex gap-1.5 font-mono text-[10px]">
            {[
              ["AI", system.openrouterReady],
              ["搜索", system.firecrawlReady],
              ["邮件", system.mailConfigured],
            ].map(([label, ok]) => (
              <span key={label}
                className={cn("rounded-full border px-2.5 py-1",
                  ok ? "border-signal/30 text-signal" : "border-critical/30 text-critical")}>
                {label} {ok ? "✓" : "✗"}
              </span>
            ))}
          </div>
        </div>

        {/* 快讯跑马灯（有确认信号才显示） */}
        {tickerItems.length > 0 && (
          <div className="relative border-t border-edge/60 py-1">
            <InfiniteMovingCards items={tickerItems} speed="slow" pauseOnHover />
          </div>
        )}
      </header>

      {/* ── 主体 ── */}
      <main className="relative mx-auto grid max-w-[1400px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-[340px_1fr]">
        {/* 左栏 */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-[76px] lg:self-start">
          <section className="rounded-xl border border-edge bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              <span className={cn("h-1.5 w-1.5 rounded-full", system.openrouterReady ? "bg-signal" : "bg-critical")} />
              {system.openrouterReady ? "SCANNING · 扫描态势" : "AI KEY MISSING · 待配置"}
            </div>
            <RadarScope keywords={keywords} signals={signals} schedule={schedule} />
          </section>

          <section className="rounded-xl border border-edge bg-white/[0.02] p-4">
            <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">调度队列</div>
            {!schedule.length && <div className="py-2 text-[12px] text-ink-faint">队列为空</div>}
            <div className="flex flex-col gap-2">
              {schedule.map((s) => {
                const kw = keywords.find((k) => k.id === s.keywordId);
                if (!kw) return null;
                const total = kw.kind === "domain" ? 3600 : kw.interval_min * 60;
                const pct = Math.max(0, Math.min(100, 100 - (s.inSec / total) * 100));
                return (
                  <div key={s.keywordId} className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="w-[76px] truncate text-ink">{kw.word}</span>
                    <div className="h-0.5 flex-1 overflow-hidden rounded bg-white/[0.07]">
                      <div className="h-full bg-signal/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right text-ink-faint">
                      {s.inSec < 60 ? `${s.inSec}s` : `${Math.floor(s.inSec / 60)}m`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        {/* 内容区 */}
        <section className="min-w-0">
          {tab === "signals" && (
            <>
              <div className="mb-3.5 flex flex-wrap items-center gap-3">
                <h2 className="font-mono text-[14px] tracking-widest text-ink">捕获信号</h2>
                <span className="rounded-full border border-signal/30 px-2.5 py-0.5 font-mono text-[11px] text-signal">
                  {signals.length}
                </span>
                <label className="ml-auto flex cursor-pointer items-center gap-2 font-mono text-[11px] text-ink-dim">
                  <input type="checkbox" className="accent-[#00e68a]" checked={showSuspect}
                    onChange={(e) => setShowSuspect(e.target.checked)} />
                  显示疑似信号（60-74%）
                </label>
              </div>
              <SignalStream signals={signals} showSuspect={showSuspect} tab={tab} />
            </>
          )}

          {tab === "hotspots" && (
            <>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="font-mono text-[14px] tracking-widest text-ink">领域热点榜</h2>
                <button onClick={refresh}
                  className="ml-auto rounded-lg border border-edge bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-signal/40 hover:text-signal">
                  ↻ 刷新
                </button>
              </div>
              <HotspotBoard hotspots={hotspots} />
            </>
          )}

          {tab === "keywords" && (
            <>
              <h2 className="mb-4 font-mono text-[14px] tracking-widest text-ink">监控词管理</h2>
              <KeywordsPanel keywords={keywords} schedule={schedule} refresh={refresh} notify={notify} />
            </>
          )}

          {tab === "settings" && (
            <>
              <h2 className="mb-4 font-mono text-[14px] tracking-widest text-ink">雷达站设置</h2>
              <SettingsPanel notify={notify} onSaved={refresh} />
            </>
          )}
        </section>
      </main>

      <Toasts toasts={toasts} />
    </div>
  );
}
