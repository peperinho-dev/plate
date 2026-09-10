// The swipeable widget deck at the top of the dashboard, with page dots.
//
// Scroll-snap rather than a drag library: this is a horizontal pager, and
// the browser already does momentum, rubber-banding and snap points
// natively. dnd-kit is here for reordering cards, which is a different
// gesture with different expectations.
import { useEffect, useRef, useState } from "react";

interface WidgetDeckProps {
  children: React.ReactNode[];
}

export function WidgetDeck({ children }: WidgetDeckProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const pages = children.length;

  // Derives the page from scroll position rather than tracking the
  // gesture, so a snap that lands from a fling, a keyboard scroll or a
  // dot tap all report the same way.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = el.clientWidth || 1;
        setPage(Math.max(0, Math.min(pages - 1, Math.round(el.scrollLeft / width))));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pages]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="widget-deck">
      <div className="widget-track" ref={trackRef}>
        {children.map((child, i) => (
          <div className="widget-page" key={i}>
            {child}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="widget-dots">
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              className={"widget-dot" + (i === page ? " is-active" : "")}
              aria-label={`Widget ${i + 1}`}
              aria-current={i === page}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
