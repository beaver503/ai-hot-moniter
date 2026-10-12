/** 信号流：Aceternity AnimatedList 承载，「第一时间」的核心体感 */
import { AnimatedList } from "@/components/aceternity/animated-list";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/hooks/useRadarState";

function SignalCard({ signal, isNew }) {
  const suspect = signal.verdict === "real" && signal.confidence >= 60 && signal.confidence < 75;
  const conf = signal.confidence || 0;
  return (
    <article
      className={cn(
        "group relative rounded-xl border bg-white/[0.02] p-4 transition-colors duration-300",
        suspect
          ? "border-dashed border-heat/30 hover:border-heat/50"
          : "border-edge hover:border-white/20",
        isNew && "border-signal/50 shadow-[0_0_28px_-8px_rgba(0,230,138,0.45)]",
      )}
    >
      {/* 左缘信号条 */}
      <div className={cn(
        "absolute inset-y-3 left-0 w-0.5 rounded-full",
        suspect ? "bg-heat/60" : "bg-signal/70",
      )} />

      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="rounded border border-signal/25 bg-signal/[0.07] px-2 py-0.5 font-mono text-[10px] tracking-widest text-signal">
          {signal.keyword}
        </span>
        <span className={cn(
          "rounded border px-2 py-0.5 font-mono text-[10px] tracking-widest",
          suspect ? "border-heat/40 text-heat" : "border-signal/40 text-signal",
        )}>
          {suspect ? "◈ 疑似" : "◉ 确认"}
        </span>
        {signal.notified && (
          <span className="rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] text-ink-faint">已通知</span>
        )}
        <span className="ml-auto font-mono text-[11px] text-ink-faint">{timeAgo(signal.foundAt)}</span>
      </div>

      <h3 className="text-[15px] font-medium leading-snug text-ink">
        <a href={signal.url} target="_blank" rel="noopener" className="transition-colors hover:text-signal">
          {signal.title}
        </a>
      </h3>

      <div className="mt-2.5 flex items-center gap-2.5">
        <span className="font-mono text-[10px] text-ink-faint">AI</span>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className={cn("h-full rounded-full", suspect ? "bg-heat" : "bg-signal")}
            style={{ width: `${conf}%` }}
          />
        </div>
        <span className={cn("font-mono text-[11px]", suspect ? "text-heat" : "text-signal")}>{conf}%</span>
        <span className="font-mono text-[11px] text-ink-faint">⌲ {signal.source || "web"}</span>
      </div>

      {signal.summary && (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{signal.summary}</p>
      )}
    </article>
  );
}

export function SignalStream({ signals, showSuspect, tab }) {
  const list = signals.filter((s) => showSuspect || s.confidence >= 75);

  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center">
        <div className="font-mono text-4xl text-signal/30">⌖</div>
        <p className="text-sm text-ink-dim">雷达正在扫描，尚未捕获确认信号</p>
        <p className="font-mono text-[11px] text-ink-faint">
          AI 会过滤标题党 / 传闻 / 蹭热度 —— 宁可没有，不给垃圾
        </p>
      </div>
    );
  }

  return (
    <AnimatedList
      items={list}
      reverse                       /* 最新的永远在最上，即时可见 */
      showXItems={12}
      staggerDelay={0.06}
      renderItem={(s, idx) => (
        <SignalCard signal={s} isNew={tab === "signals" && idx === 0 && s.foundAt > Date.now() / 1000 - 300} />
      )}
    />
  );
}
