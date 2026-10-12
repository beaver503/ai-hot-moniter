/** 雷达扫描主视觉：OLED 黑 + 信号点 + ping */
import { cn } from "@/lib/utils";
import { timeAgo } from "@/hooks/useRadarState";

export function RadarScope({ keywords, signals, schedule }) {
  const enabled = keywords.filter((k) => k.enabled);
  const R = 40;

  return (
    <div className="select-none">
      <div className="relative mx-auto aspect-square w-full max-w-[340px]">
        {/* 网格圆环 + 扫描锥 */}
      <div className="absolute inset-0 rounded-full border border-white/10 bg-black/40
        shadow-[inset_0_0_60px_rgba(0,0,0,0.7),0_0_50px_-12px_rgba(0,230,138,0.18)]"
        style={{
          backgroundImage:
            "radial-gradient(circle, transparent 0 24.5%, rgba(0,230,138,.08) 25%, transparent 25.5%)," +
            "radial-gradient(circle, transparent 0 49.5%, rgba(0,230,138,.08) 50%, transparent 50.5%)," +
            "radial-gradient(circle, transparent 0 74.5%, rgba(0,230,138,.08) 75%, transparent 75.5%)",
        }}
      >
        <div className="radar-sweep absolute inset-0 rounded-full" />
        {/* 十字线 */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.06]" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.06]" />
      </div>

      {/* 信号点 */}
      {enabled.map((k, i) => {
        const angle = ((i * 360) / Math.max(enabled.length, 1) - 90) * (Math.PI / 180);
        const recent = signals.some(
          (s) => s.keywordId === k.id && Date.now() / 1000 - s.foundAt < 3600,
        );
        const r = recent ? R * 0.45 : R * (0.68 + (i % 3) * 0.13);
        const x = 50 + r * Math.cos(angle);
        const y = 50 + r * Math.sin(angle);
        return (
          <div key={k.id} className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
            <div
              className={cn(
                "-translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-500",
                recent
                  ? "h-2.5 w-2.5 bg-signal shadow-[0_0_14px_rgba(0,230,138,0.9)]"
                  : "h-1.5 w-1.5 bg-signal-dim/70",
              )}
            />
            {recent && (
              <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border border-signal animate-ping-signal" />
            )}
            <span className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] tracking-wide text-ink-dim">
              {k.word}
            </span>
          </div>
        );
      })}

      {/* 中心核 */}
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_16px_rgba(0,230,138,0.9)]" />
      </div>
      {/* 图例：流式布局，不再绝对定位 */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-faint">
        {enabled.length === 0 && <span>NO TARGETS · 前往「监控词」添加</span>}
        {enabled.map((k) => {
          const sched = schedule.find((s) => s.keywordId === k.id);
          return (
            <span key={k.id}>
              <b className="font-medium text-ink">{k.word}</b>
              <span className="text-ink-faint">
                {" "}· {k.kind === "domain" ? "热点" : "监控"}
                {sched ? ` · T-${Math.max(0, Math.floor(sched.inSec / 60))}m` : ""}
              </span>
            </span>
          );
        })}
      </div>
      {/* 最后捕获时间水印 */}
      {signals[0] && (
        <div className="mt-1 text-right font-mono text-[10px] text-ink-faint">
          LAST CAPTURE {timeAgo(signals[0].foundAt)}
        </div>
      )}
    </div>
  );
}
