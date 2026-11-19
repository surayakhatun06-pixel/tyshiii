import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

/**
 * A horizontally scrolling strip that keeps native touch/trackpad momentum and
 * supports grab-and-drag with a short, reduced-motion-aware mouse glide.
 */
export const DragScroller = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function DragScroller({ className, children, ...rest }, forwarded) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwarded, () => ref.current as HTMLDivElement);

  const state = useRef({
    down: false,
    dragging: false,
    startX: 0,
    startScroll: 0,
    lastX: 0,
    lastT: 0,
    pendingX: 0,
    velocity: 0,
    swallowClick: false,
    swallowTimer: 0,
    raf: 0,
  });

  const stopGlide = () => {
    cancelAnimationFrame(state.current.raf);
    state.current.raf = 0;
  };

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = state.current;
      current.swallowClick = false;
      window.clearTimeout(current.swallowTimer);
      // Touch and pen keep the browser's native, immediate scroll and inertia.
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const element = ref.current;
      if (!element) return;

      stopGlide();
      current.down = true;
      current.dragging = false;
      current.startX = event.clientX;
      current.startScroll = element.scrollLeft;
      current.lastX = event.clientX;
      current.pendingX = event.clientX;
      current.lastT = performance.now();
      current.velocity = 0;
    },
    [],
  );

  useEffect(() => {
    const current = state.current;

    const applyDragPosition = () => {
      const element = ref.current;
      if (!current.down || !current.dragging || !element) return;
      element.scrollLeft =
        current.startScroll - (current.pendingX - current.startX);

      const now = performance.now();
      const elapsed = now - current.lastT;
      if (elapsed > 0)
        current.velocity = (current.lastX - current.pendingX) / elapsed;
      current.lastX = current.pendingX;
      current.lastT = now;
    };

    const move = (event: PointerEvent) => {
      const element = ref.current;
      if (!current.down || !element) return;

      current.pendingX = event.clientX;
      if (!current.dragging) {
        if (Math.abs(current.pendingX - current.startX) < 6) return;
        current.dragging = true;
        element.dataset.dragging = "true";
        element.style.cursor = "grabbing";
        element.style.userSelect = "none";
      }

      event.preventDefault();
      if (!current.raf) {
        current.raf = requestAnimationFrame(() => {
          current.raf = 0;
          applyDragPosition();
        });
      }
    };

    const finish = () => {
      const element = ref.current;
      if (!current.down) return;
      if (current.raf) {
        cancelAnimationFrame(current.raf);
        current.raf = 0;
        applyDragPosition();
      }
      current.down = false;
      if (!element) return;
      element.style.cursor = "";
      element.style.userSelect = "";
      delete element.dataset.dragging;
      if (!current.dragging) return;

      current.dragging = false;
      current.swallowClick = true;
      current.swallowTimer = window.setTimeout(() => {
        current.swallowClick = false;
        current.swallowTimer = 0;
      }, 300);

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      let velocity =
        Math.abs(current.velocity) > 0.15 ? current.velocity * 16 : 0;
      const glide = () => {
        if (Math.abs(velocity) < 0.5) return;
        element.scrollLeft += velocity;
        velocity *= 0.93;
        current.raf = requestAnimationFrame(glide);
      };
      if (velocity) current.raf = requestAnimationFrame(glide);
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      stopGlide();
    };
  }, []);

  return (
    <div
      {...rest}
      ref={ref}
      style={{ ...rest.style, WebkitOverflowScrolling: "touch" }}
      onPointerDown={onPointerDown}
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (state.current.swallowClick) {
          event.preventDefault();
          event.stopPropagation();
          state.current.swallowClick = false;
          window.clearTimeout(state.current.swallowTimer);
          state.current.swallowTimer = 0;
        }
      }}
      className={cn(
        "drag-scroller no-scrollbar flex w-full max-w-full cursor-grab touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden overscroll-x-contain py-3",
        className,
      )}
    >
      {children}
    </div>
  );
});
