/** 热点榜：Aceternity Bento Grid，Top3 双倍宽 + 热度条 */
import { BentoGrid, BentoCard } from "@/components/aceternity/bento-grid";
import { timeAgo } from "@/hooks/useRadarState";

function HotspotCard({ h, rank }) {
  return (
    <BentoCard top3={rank <= 3}>
      <div className="flex items-start gap-3">
        <span
          className={
            "font-mono text-xl font-bold leading-none " +
            (rank === 1 ? "text-heat drop-shadow-[0_0_10px_rgba(255,178,36,0.5)]"
              : rank === 2 ? "text-ink"
              : rank === 3 ? "text-heat/70"
              : "text-ink-faint")
          }
        >
          {String(rank).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-medium leading-snug text-ink">{h.title}</h3>
          {h.summary && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">{h.summary}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ff6b35] to-heat"
            style={{ width: `${h.heat}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-heat">HEAT {h.heat}</span>
        <span className="ml-auto font-mono text-[10px] text-ink-faint">{h.sources.length} 源</span>
      </div>
      {h.sources.length > 0 && (
        <div className="hidden flex-col gap-0.5 group-hover/bento:flex">
          {h.sources.slice(0, 3).map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener"
              className="truncate font-mono text-[10.5px] text-ink-faint transition-colors hover:text-signal"
            >
              ↗ [{s.source || "web"}] {s.title || s.url}
            </a>
          ))}
        </div>
      )}
    </BentoCard>
  );
}

export function HotspotBoard({ hotspots }) {
  if (!hotspots.length || hotspots.every((a) => !a.items.length)) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center">
        <div className="font-mono text-4xl text-domain/30">▦</div>
        <p className="text-sm text-ink-dim">暂无热点数据</p>
        <p className="font-mono text-[11px] text-ink-faint">在「监控词」中添加领域词（如 AI 编程），系统会定时聚合热点榜</p>
      </div>
    );
  }

  return hotspots.map((area) => (
    <section key={area.domainId} className="mb-8">
      <div className="mb-3 flex items-baseline gap-3 border-b border-dashed border-edge pb-2">
        <h3 className="font-mono text-[13px] tracking-widest text-ink">▦ {area.domain}</h3>
        <span className="font-mono text-[10px] text-ink-faint">
          {area.updatedAt ? `UPDATED ${timeAgo(area.updatedAt)}` : "PENDING"}
        </span>
      </div>
      <BentoGrid className="md:grid-cols-3 max-w-none">
        {area.items.map((h, i) => (
          <HotspotCard key={h.rank} h={h} rank={i + 1} />
        ))}
      </BentoGrid>
    </section>
  ));
}
