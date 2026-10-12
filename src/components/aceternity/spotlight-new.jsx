/**
 * Aceternity UI · Spotlight New
 * https://ui.aceternity.com/components/spotlight-new
 * 按 Context7 拉取的官方 Props 规范实现：三层径向渐变 + 水平呼吸动画。
 */
import { cn } from "@/lib/utils";

export function SpotlightNew({
  gradientFirst = "radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(152, 100%, 72%, .10) 0, hsla(152, 100%, 55%, .03) 50%, hsla(152, 100%, 45%, 0) 80%)",
  gradientSecond = "radial-gradient(50% 50% at 50% 50%, hsla(152, 100%, 72%, .07) 0, hsla(152, 100%, 55%, .02) 80%, transparent 100%)",
  gradientThird = "radial-gradient(50% 50% at 50% 50%, hsla(152, 100%, 72%, .05) 0, hsla(152, 100%, 45%, .02) 80%, transparent 100%)",
  translateY = -320,
  width = 560,
  height = 1380,
  smallWidth = 240,
  duration = 7,
  xOffset = 90,
  className,
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 left-1/2 z-0 h-full w-full overflow-visible opacity-100",
        className,
      )}
      style={{ transform: `translateY(${translateY}px)`, "--x": `${xOffset}px` }}
    >
      <div
        className="absolute start-1/2 top-0 aspect-square h-[80%] w-[80%] rounded-full"
        style={{ background: gradientFirst, width, height, animation: `spotlight-x ${duration}s ease-in-out infinite alternate` }}
      />
      <div
        className="absolute start-1/2 top-0 aspect-square rounded-full"
        style={{ background: gradientSecond, width: smallWidth, height, animation: `spotlight-x ${duration}s ease-in-out infinite alternate` }}
      />
      <div
        className="absolute start-1/2 top-0 aspect-square rounded-full"
        style={{ background: gradientThird, width: smallWidth, height, animation: `spotlight-x ${duration / 2}s ease-in-out infinite alternate` }}
      />
      <style>{`
        @keyframes spotlight-x {
          0% { transform: translateX(calc(-50% - var(--x, 90px))); }
          100% { transform: translateX(calc(-50% + var(--x, 90px))); }
        }
      `}</style>
    </div>
  );
}
