/**
 * Aceternity UI · Bento Grid
 * https://ui.aceternity.com/blog/how-to-create-a-bento-grid-with-tailwindcss-nextjs-and-framer-motion
 * 热点榜布局：rank 越高卡片越大（col-span 联动热度）。
 */
import { cn } from "@/lib/utils";

export function BentoGrid({ className, children }) {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-3 auto-rows-[minmax(0,auto)] md:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BentoCard({ className, children, top3 = false }) {
  return (
    <div
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between space-y-3 rounded-xl border border-edge bg-white/[0.02] p-4",
        "transition duration-300 hover:border-white/20 hover:bg-white/[0.04]",
        "shadow-[0_0_0_0_rgba(0,230,138,0)] hover:shadow-[0_0_24px_-6px_rgba(0,230,138,0.25)]",
        top3 && "md:col-span-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
