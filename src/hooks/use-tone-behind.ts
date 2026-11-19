import { useEffect, useRef, useState } from "react";

/**
 * Is the page BEHIND this button bright? (doc 1.10)
 * Dark behind: the button is plain (just the icon). Bright or a picture behind: it gets dark glass.
 * Checked on scroll, resize and when the page changes, never more than once per animation frame.
 */
export function useBrightBehind<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // Start with glass: a button that is unreadable is worse than one that is slightly too visible.
  const [bright, setBright] = useState(true);

  useEffect(() => {
    let frame = 0;
    const luminance = (rgb: string) => {
      const m = rgb.match(/[\d.]+/g);
      if (!m || m.length < 3) return null;
      const [r, g, b] = m.slice(0, 3).map(Number);
      const a = m.length > 3 ? Number(m[3]) : 1;
      if (a < 0.5) return null; // see-through: look at what is further behind
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };

    const check = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const stack = document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      for (const node of stack) {
        if (node === el || el.contains(node) || node.contains(el)) continue;
        // A picture or video behind the button: it may be bright, so show glass.
        if (node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement) {
          setBright(true);
          return;
        }
        const style = getComputedStyle(node);
        const lum = luminance(style.backgroundColor);
        if (lum !== null) {
          setBright(lum > 0.45);
          return;
        }
      }
      setBright(false);
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Pages swap banners and sections without scrolling: look again every second as well.
    const timer = window.setInterval(schedule, 1000);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.clearInterval(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return [ref, bright] as const;
}
