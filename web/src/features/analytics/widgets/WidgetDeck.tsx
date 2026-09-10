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
  // The page we believe we're on, kept separately from scroll position
  // because a resize invalidates the position but not the intent.
  const pageRef = useRef(0);

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
        const next = Math.max(0, Math.min(pages - 1, Math.round(el.scrollLeft / width)));
        pageRef.current = next;
        setPage(next);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pages]);

  // Scroll offsets are in pixels, so a width change leaves the deck
  // parked between two widgets — half of one and half of the next, with
  // the dots still claiming a whole page. Snapping is not re-applied by
  // the browser on resize, so the page is restored explicitly.
  //
  // This is rotation on a phone, and also the keyboard opening: both
  // change the viewport under a deck that has been scrolled.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (!width) return;
      const wanted = pageRef.current * width;
      if (Math.abs(el.scrollLeft - wanted) > 1) el.scrollLeft = wanted;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    pageRef.current = i;
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
