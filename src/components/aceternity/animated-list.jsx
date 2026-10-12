/**
 * Aceternity UI · Animated List
 * 官方 API（notification feed 用法）：items / reverse / showXItems / hoverState /
 * 每项带 spring + staggered 弹入动画 —— 新信号「第一时间」出现的核心体感。
 */
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export function AnimatedList({
  items,
  renderItem,
  reverse = false,
  showXItems = 8,
  staggerDelay = 0.08,
  className,
}) {
  const [index, setIndex] = React.useState(0);
  const prevLen = React.useRef(items.length);
  const visible = React.useMemo(
    () => items.slice(0, showXItems),
    [items, showXItems],
  );

  // 数据变化（新信号到达）→ 从头重放入场 stagger
  React.useEffect(() => {
    if (items.length !== prevLen.current) {
      prevLen.current = items.length;
      setIndex((i) => i + 1);
    }
  }, [items.length]);

  const list = reverse ? [...visible].reverse() : visible;

  return (
    <div className={cn("flex flex-col gap-2.5 p-0.5", className)}>
      <AnimatePresence>
        {list.map((item, idx) => (
          <AnimatedListItem
            key={item.id ?? idx}
            item={item}
            idx={idx}
            replayKey={index}
            staggerDelay={staggerDelay}
            renderItem={renderItem}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function AnimatedListItem({ item, idx, replayKey, staggerDelay, renderItem }) {
  const animations = {
    initial: { scale: 0, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring",
        bounce: 0.28,
        duration: 0.55,
        delay: idx * staggerDelay,
      },
    },
    exit: { scale: 0, opacity: 0, transition: { duration: 0.18 } },
  };

  return (
    <motion.div
      {...animations}
      layout
      style={{ transformOrigin: "top center" }}
    >
      {renderItem(item, idx)}
    </motion.div>
  );
}
