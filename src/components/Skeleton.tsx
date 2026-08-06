/**
 * Skeletons, not spinners.
 *
 * On a slow connection a spinner tells you nothing; a skeleton shows the shape
 * of what is coming and makes the wait feel shorter. It also prevents layout
 * shift when the content lands.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-control bg-ink-raised ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'h-4 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  );
}
