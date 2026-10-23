import { useEffect, useRef } from "react";

// A field of ink dots laid out like ledger rules. Dots near the pointer drift
// away and warm from blue-ink to saffron to bahi-red; a click or tap sends a
// ripple across the page. Pauses off-screen and respects reduced motion.
export default function InkField({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, dots = [], raf = 0, visible = true, t0 = performance.now();
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };
    const ripples = [];
    let colors = readColors();

    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      const get = (v, f) => cs.getPropertyValue(v).trim() || f;
      return { ink: get("--ink-3", "#7a8098"), hot: get("--bahi", "#a3161c"), warm: get("--thread", "#e0a33a") };
    }
    function hexToRgb(hex) {
      const m = hex.replace("#", "");
      const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    let rgb = { ink: hexToRgb(colors.ink), hot: hexToRgb(colors.hot), warm: hexToRgb(colors.warm) };
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

    function layout() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gap = w < 600 ? 26 : 30;
      dots = [];
      for (let y = gap / 2; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) dots.push({ bx: x, by: y, x, y, vx: 0, vy: 0 });
      }
    }

    function frame(now) {
      raf = 0;
      if (!visible) return;
      const t = (now - t0) / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.18;
      pointer.y += (pointer.ty - pointer.y) * 0.18;
      ctx.clearRect(0, 0, w, h);
      const R = w < 600 ? 110 : 150;
      for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].t > 2.2) ripples.splice(i, 1);

      for (const d of dots) {
        // gentle idle breathing so the page feels alive without a cursor
        const idle = reduced ? 0 : Math.sin(t * 0.8 + d.bx * 0.012 + d.by * 0.02) * 1.2;
        let fx = (d.bx - d.x) * 0.08, fy = (d.by + idle - d.y) * 0.08;
        let heat = 0;
        const dx = d.x - pointer.x, dy = d.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (pointer.active && dist < R) {
          const k = 1 - dist / R;
          fx += (dx / (dist || 1)) * k * k * 6;
          fy += (dy / (dist || 1)) * k * k * 6;
          heat = Math.max(heat, k);
        }
        for (const rp of ripples) {
          const age = t - rp.t;
          const ring = age * 520;
          const rd = Math.hypot(d.bx - rp.x, d.by - rp.y);
          const band = Math.abs(rd - ring);
          if (band < 40) {
            const k = (1 - band / 40) * (1 - age / 2.2);
            fx += ((d.bx - rp.x) / (rd || 1)) * k * 5;
            fy += ((d.by - rp.y) / (rd || 1)) * k * 5;
            heat = Math.max(heat, k * 0.9);
          }
        }
        d.vx = (d.vx + fx) * 0.78;
        d.vy = (d.vy + fy) * 0.78;
        d.x += d.vx;
        d.y += d.vy;

        const c = heat > 0.5 ? mix(rgb.warm, rgb.hot, (heat - 0.5) * 2) : mix(rgb.ink, rgb.warm, heat * 2);
        const alpha = 0.22 + heat * 0.7;
        const size = 1.1 + heat * 2.4;
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };

    function local(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
    }
    const onMove = (e) => {
      const p = local(e);
      pointer.tx = p.x;
      pointer.ty = p.y;
      if (!pointer.active) { pointer.x = p.x; pointer.y = p.y; }
      pointer.active = p.inside;
      kick();
    };
    const onDown = (e) => {
      const p = local(e);
      if (!p.inside) return;
      ripples.push({ x: p.x, y: p.y, t: (performance.now() - t0) / 1000 });
      kick();
    };
    const onLeave = () => { pointer.active = false; };

    layout();
    kick();
    const ro = new ResizeObserver(() => { layout(); kick(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); });
    io.observe(canvas);
    const mo = new MutationObserver(() => {
      colors = readColors();
      rgb = { ink: hexToRgb(colors.ink), hot: hexToRgb(colors.hot), warm: hexToRgb(colors.warm) };
      kick();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    const onVis = () => { visible = !document.hidden; kick(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className={`ink-field ${className}`} aria-hidden="true" />;
}
