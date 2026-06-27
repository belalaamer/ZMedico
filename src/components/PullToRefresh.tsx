import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Mobile-only pull-to-refresh wrapper. Attaches to the nearest scrollable
 * <main> element used by AppShell. No-op on desktop.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown> | void;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const startY = useRef<number | null>(null);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const THRESHOLD = 70;

  useEffect(() => {
    if (!isMobile) return;
    const scroller = document.querySelector("main");
    if (!scroller) return;

    const setPullBoth = (v: number) => { pullRef.current = v; setPull(v); };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (scroller.scrollTop > 0) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || scroller.scrollTop > 0) { setPullBoth(0); return; }
      setPullBoth(Math.min(dy * 0.5, 120));
    };
    const onEnd = async () => {
      if (startY.current == null) return;
      startY.current = null;
      const current = pullRef.current;
      if (current >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        try { await onRefreshRef.current(); } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullBoth(0);
        }
      } else {
        setPullBoth(0);
      }
    };

    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: true });
    scroller.addEventListener("touchend", onEnd, { passive: true });
    scroller.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
    };
  }, [isMobile]);

  const visible = isMobile && (pull > 0 || refreshing);
  return (
    <>
      {visible && (
        <div
          className="flex items-center justify-center text-muted-foreground overflow-hidden"
          style={{
            height: refreshing ? 48 : pull,
            transition: refreshing ? "height 200ms ease" : "none",
          }}
          aria-live="polite"
          aria-label={refreshing ? "Refreshing" : "Pull to refresh"}
        >
          <RefreshCw
            className={`size-5 ${refreshing ? "animate-spin" : ""}`}
            style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
          />
        </div>
      )}
      {children}
    </>
  );
}