// A number that pops once whenever it changes (keyed by its value, so React remounts
// the span and the CSS animation replays). Still on first paint; off under reduced motion.

export default function AnimatedCount({ value, className }: { value: number; className?: string }) {
  return <span key={value} data-count={value} className={`lp-pop ${className ?? ''}`.trim()}>{value}</span>;
}
