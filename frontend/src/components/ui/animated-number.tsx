import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";

/** Counts up to `value` once visible. `format` renders the intermediate number. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString(), duration = 1.2, className }: {
  value: number; format?: (n: number) => string; duration?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const from = useRef(0);

  useEffect(() => {
    if (!inView || !ref.current) return;
    const node = ref.current;
    const controls = animate(from.current, value, {
      duration, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { node.textContent = format(v); },
    });
    from.current = value;
    return () => controls.stop();
  }, [inView, value, duration, format]);

  return <span ref={ref} className={className}>{format(0)}</span>;
}
