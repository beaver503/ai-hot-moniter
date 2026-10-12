/**
 * Aceternity UI · Infinite Moving Cards
 * https://ui.aceternity.com/components/infinite-moving-cards
 * 官方 API：items / direction / speed / pauseOnHover。快讯跑马灯用。
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export function InfiniteMovingCards({
  items,
  direction = "left",
  speed = "slow",
  pauseOnHover = true,
  className,
}) {
  const containerRef = React.useRef(null);
  const scrollerRef = React.useRef(null);
  const [start, setStart] = React.useState(false);

  React.useEffect(() => {
    addAnimation();
  }, []);

  function addAnimation() {
    if (!containerRef.current || !scrollerRef.current) return;
    const scrollerContent = Array.from(scrollerRef.current.children);
    for (const item of scrollerContent) {
      const duplicatedItem = item.cloneNode(true);
      duplicatedItem.setAttribute("aria-hidden", "true");
      scrollerRef.current.appendChild(duplicatedItem);
    }
    containerRef.current.style.setProperty(
      "--marquee-direction",
      direction === "left" ? "normal" : "reverse",
    );
    containerRef.current.style.setProperty(
      "--marquee-duration",
      speed === "fast" ? "20s" : speed === "normal" ? "40s" : "70s",
    );
    setStart(true);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "scroller relative z-20 max-w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_8%,white_92%,transparent)]",
        className,
      )}
    >
      <ul
        ref={scrollerRef}
        className={cn(
          "flex w-max min-w-full shrink-0 flex-nowrap gap-3 py-1",
          start && "animate-marquee",
          pauseOnHover && "hover:[animation-play-state:paused]",
        )}
        style={{ animationDirection: "var(--marquee-direction, normal)" }}
      >
        {items.map((item, idx) => (
          <li
            key={`${item.title}-${idx}`}
            className="relative flex max-w-full shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] leading-none md:w-auto"
          >
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", item.tone === "hot" ? "bg-heat" : "bg-signal")} />
            <span className="text-ink-dim">{item.keyword}</span>
            <a href={item.url} target="_blank" rel="noopener" className="text-ink hover:text-signal transition-colors">
              {item.title.length > 52 ? `${item.title.slice(0, 52)}…` : item.title}
            </a>
            <span className="text-ink-faint">{item.timeLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
