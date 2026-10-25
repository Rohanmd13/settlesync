import { useEffect, useRef } from "react";

// When you try to scroll past the very top or bottom of the page, a soft
// saffron-to-red glow swells at that edge and fades, like a page resisting.
export default function EdgeGlow() {
  const top = useRef(null);
  const bottom = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let topV = 0, botV = 0, raf = 0, touchY = null;

    const atTop = () => window.scrollY <= 0;
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1;

    const paint = () => {
      raf = 0;
      topV *= 0.9;
      botV *= 0.9;
      if (top.current) top.current.style.setProperty("--v", topV.toFixed(3));
      if (bottom.current) bottom.current.style.setProperty("--v", botV.toFixed(3));
      if (topV > 0.01 || botV > 0.01) raf = requestAnimationFrame(paint);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const push = (dy) => {
      if (document.body.classList.contains("no-scroll")) return;
      if (dy < 0 && atTop()) topV = Math.min(1, topV + Math.min(0.35, -dy / 300));
      else if (dy > 0 && atBottom()) botV = Math.min(1, botV + Math.min(0.35, dy / 300));
      else return;
      kick();
    };

    const onWheel = (e) => push(e.deltaY);
    const onTouchStart = (e) => { touchY = e.touches[0]?.clientY ?? null; };
    const onTouchMove = (e) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      push((touchY - y) * 1.5);
      touchY = y;
    };
    const onKey = (e) => {
      if (["ArrowDown", "PageDown", "End", " "].includes(e.key)) push(120);
      if (["ArrowUp", "PageUp", "Home"].includes(e.key)) push(-120);
    };

    if (reduced) return;
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      <div ref={top} className="edge-glow edge-glow--top" aria-hidden="true" />
      <div ref={bottom} className="edge-glow edge-glow--bottom" aria-hidden="true" />
    </>
  );
}
