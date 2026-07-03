/* Scroll-scrubbed hero — a continuous liquid simulation.
   One progress value (0–1) drives: the pot tilting into the pour, the
   stream (with a falling droplet head), the cup filling level by level,
   a meniscus bulge, drips, a glaze sheet, and one unified liquid body —
   surface(x) = table − spreading mound − flood rise + traveling wave —
   whose path is rebuilt every frame. Scene shapes come from Haley's
   vector export (frame-03-source.svg). */

(function () {
  const track = document.getElementById("hero-track");
  const hint = document.getElementById("scroll-hint");

  const $ = (id) => document.getElementById(id);
  const potSwing = $("pot-swing");
  const stream = $("stream");
  const streamSway = $("stream-sway");
  const droplet = $("droplet");
  const cupCoffee = $("cup-coffee");
  const drips = [$("drip0"), $("drip1"), $("drip2"), $("drip3")];
  const sheet = $("sheet");
  const liquid = $("liquid");
  const liquidClip = $("liquid-clip-path");
  const persimmon = $("persimmon");
  const persimmonShadow = $("persimmon-shadow");
  const persimmonDip = $("persimmon-dip");
  const splash = $("splash");
  const cupShadow = $("cup-shadow");
  const cupHandle = $("cup-handle");

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- geometry anchors (from the vector export) ---------- */
  const TABLE_Y = 895.39;
  const CUP = { cx: 635.72, rimY: 823.86, rimRx: 165.06, rimRy: 31.51, top: 819.58, r: 177.54 };
  const RING = { cx: 1040, cy: 398 }; // handle ring center — the pour pivot
  const PERSIMMON = { cx: 1148, base: 967.21, height: 178.38 };
  const STREAM_END = { x: 632, y: 798.22 };

  /* stream length ↔ height lookup, so the stream can end exactly at any
     landing height along its curve */
  const streamLen = stream.getTotalLength();
  stream.setAttribute("stroke-dasharray", streamLen);
  stream.setAttribute("stroke-dashoffset", streamLen);
  const streamLUT = [];
  for (let i = 0; i <= 120; i++) {
    const l = (streamLen * i) / 120;
    const pt = stream.getPointAtLength(l);
    streamLUT.push({ l, x: pt.x, y: pt.y });
  }
  function streamLenAtY(y) {
    if (y >= streamLUT[streamLUT.length - 1].y) return streamLen;
    for (let i = 1; i < streamLUT.length; i++) {
      if (streamLUT[i].y >= y) {
        const a = streamLUT[i - 1], b = streamLUT[i];
        const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
        return lerp(a.l, b.l, t);
      }
    }
    return 0;
  }
  function streamPointAt(l) {
    return stream.getPointAtLength(clamp(l, 0, streamLen));
  }

  /* drip dash setup */
  const dripLens = drips.map((d) => d.getTotalLength());
  drips.forEach((d, i) => {
    d.setAttribute("stroke-dasharray", dripLens[i]);
    d.setAttribute("stroke-dashoffset", dripLens[i]);
  });
  // staggered fall windows: [start, end] in progress
  const dripWindows = [ [0.325, 0.43], [0.35, 0.44], [0.335, 0.45], [0.31, 0.415] ];

  /* bowl half-width at height y (from the exported cup path: straight rim
     corners rounding into a 177.54-radius bottom) */
  function bowlHW(y) {
    const dy = y - CUP.top;
    if (dy <= 0) return 187;
    if (dy >= CUP.r) return 12;
    return 9.455 + Math.sqrt(Math.max(0, CUP.r * CUP.r - dy * dy));
  }

  /* ---------- the unified liquid surface ---------- */
  let H = 0, W = 300, R = 0, AMP = 0, PHASE = 0;
  function moundAt(x) {
    const g = Math.exp(-((x - CUP.cx) * (x - CUP.cx)) / (W * W));
    return H * g;
  }
  function surfaceAt(x) {
    return TABLE_Y - moundAt(x) - R + AMP * Math.sin(x * 0.02 + PHASE);
  }
  // how far below the table line the liquid body reaches at x — deeper where
  // the surface is higher, so submerged objects (cup shadow, persimmon legs)
  // are covered exactly where the liquid actually is
  function depthAt(x) {
    return Math.min(R * 4, 760) + clamp((moundAt(x) + R) * 3, 0, 220);
  }
  function buildLiquidPath() {
    if (H < 0.5 && R < 0.5) return "";
    let d = `M-20 ${surfaceAt(-20).toFixed(1)}`;
    for (let x = 4; x <= 1690; x += 24) {
      d += ` L${x} ${surfaceAt(x).toFixed(1)}`;
    }
    for (let x = 1690; x >= -20; x -= 24) {
      d += ` L${x} ${(TABLE_Y + 2 + depthAt(x)).toFixed(1)}`;
    }
    d += " Z";
    return d;
  }

  /* ---------- the glaze skirt sliding down the cup ----------
     Solid liquid coat from just under the dome down to a descending
     bottom edge with rounded hanging drip-lobes of varied depths.
     The dome above it is the (grown) meniscus ellipse — one shape,
     no seams. */
  const LOBE_ENDS = [0.18, 0.42, 0.58, 0.83, 1.0]; // segment ends across the width
  const LOBE_DEPTHS = [34, 12, 42, 10, 28];
  function buildSkirtPath(sp) {
    if (sp <= 0) return "";
    const yTop = 818;
    const yB = Math.min(lerp(842, 994, sp), 990);
    const cx = CUP.cx;
    let d = `M${(cx - bowlHW(yTop) - 10).toFixed(1)} ${yTop}`;
    for (let t = 0.1; t <= 1.001; t += 0.1) {
      const y = lerp(yTop, yB, t);
      d += ` L${(cx - bowlHW(y) - 10).toFixed(1)} ${y.toFixed(1)}`;
    }
    const hb = bowlHW(yB) + 10;
    let xPrev = cx - hb;
    LOBE_ENDS.forEach((end, i) => {
      const xEnd = lerp(cx - hb, cx + hb, end);
      const depth = LOBE_DEPTHS[i] * sp * 1.5;
      d += ` C${(xPrev + (xEnd - xPrev) * 0.2).toFixed(1)} ${(yB + depth).toFixed(1)}, ${(xPrev + (xEnd - xPrev) * 0.8).toFixed(1)} ${(yB + depth).toFixed(1)}, ${xEnd.toFixed(1)} ${yB.toFixed(1)}`;
      xPrev = xEnd;
    });
    for (let t = 0.9; t >= -0.001; t -= 0.1) {
      const y = lerp(yTop, yB, t);
      d += ` L${(cx + bowlHW(y) + 10).toFixed(1)} ${y.toFixed(1)}`;
    }
    d += " Z";
    return d;
  }

  let target = 0;
  let shown = -1; // force first paint

  function apply(p, vel) {
    /* --- the pot tilts into the pour, pivoting in the grip; scroll
       velocity leans it a touch further (inertia) --- */
    const lean = clamp(vel * 160, -4, 4);
    const tilt = lerp(-12, 0, easeInOut(seg(p, 0, 0.07))) + lean;
    potSwing.setAttribute("transform", `rotate(${tilt.toFixed(2)} ${RING.cx} ${RING.cy})`);
    // the falling stream lags the motion slightly
    const sway = clamp(vel * 220, -6, 6);
    streamSway.setAttribute(
      "transform",
      `translate(772.56 494.57) skewX(${(-sway).toFixed(2)}) translate(-772.56 -494.57)`
    );

    /* --- cup fill: the surface rises inside the mouth with perspective,
       swells into a meniscus, then keeps growing into the overflow dome --- */
    const level = easeInOut(seg(p, 0.13, 0.3));
    const bulge = easeInOut(seg(p, 0.3, 0.35)); // meniscus above the rim
    const domeP = easeInOut(seg(p, 0.36, 0.52)); // …becomes the dome
    const cy = lerp(lerp(lerp(839, CUP.rimY, level), 818, bulge), 821, domeP);
    const rx = lerp(lerp(lerp(level > 0 ? 92 : 0, CUP.rimRx, level), 196, bulge), 208, domeP);
    const ry = lerp(lerp(lerp(17, CUP.rimRy, level), 40, bulge), 51, domeP);
    cupCoffee.setAttribute("cy", cy.toFixed(2));
    cupCoffee.setAttribute("rx", rx.toFixed(2));
    cupCoffee.setAttribute("ry", ry.toFixed(2));
    const domeApex = cy - ry;

    /* --- drips run down the bowl, accelerating like falling liquid --- */
    drips.forEach((d, i) => {
      const dp = easeIn(seg(p, dripWindows[i][0], dripWindows[i][1]));
      d.setAttribute("stroke-dashoffset", dripLens[i] * (1 - dp));
    });

    /* --- glaze skirt slides down over the cup --- */
    const sheetP = domeP;
    sheet.setAttribute("d", buildSkirtPath(sheetP));

    /* --- unified liquid: mound spreads, then the flood takes the frame --- */
    const moundP = easeInOut(seg(p, 0.42, 0.66));
    const floodP = easeInOut(seg(p, 0.6, 0.94));
    R = floodP * 1140;
    H = moundP * 192 * (1 - 0.85 * seg(R, 0, 500));
    W = lerp(240, 570, moundP);
    AMP = 12 * seg(R, 20, 180) * (1 - 0.35 * seg(R, 760, 1140));
    PHASE = 2 + p * 5;
    const liquidD = buildLiquidPath();
    liquid.setAttribute("d", liquidD);
    liquidClip.setAttribute("d", liquidD);
    // the cup's shadow dissolves as the spill engulfs it; the handle
    // slips under the front of the spill
    cupShadow.setAttribute("opacity", (1 - seg(moundP, 0.4, 0.75)).toFixed(3));
    cupHandle.setAttribute("opacity", (1 - seg(moundAt(430) + R, 18, 45)).toFixed(3));

    /* --- the stream always ends ON the landing surface --- */
    let landing = STREAM_END.y + 2;
    if (bulge > 0) landing = Math.min(landing, domeApex + 4);
    landing = Math.min(landing, surfaceAt(STREAM_END.x));
    const draw = easeOut(seg(p, 0.06, 0.13));
    const shownLen = Math.min(draw * streamLen, streamLenAtY(landing));
    stream.setAttribute("stroke-dashoffset", streamLen - shownLen);

    /* --- falling droplet head while the stream draws in --- */
    if (draw > 0.02 && draw < 0.98) {
      const tip = streamPointAt(shownLen);
      droplet.setAttribute("cx", tip.x.toFixed(1));
      droplet.setAttribute("cy", (tip.y + 6).toFixed(1));
      droplet.setAttribute("opacity", (seg(draw, 0.02, 0.12) * (1 - seg(draw, 0.85, 0.98))).toFixed(3));
    } else {
      droplet.setAttribute("opacity", 0);
    }

    /* --- splash scales in softly when the pour lands, rides the surface --- */
    const splashIn = easeOutBack(seg(p, 0.125, 0.16));
    const splashOut = clamp((landing - 540) / 50, 0, 1);
    const s = splashIn * splashOut;
    splash.setAttribute("opacity", clamp(s * 1.4, 0, 1).toFixed(3));
    splash.setAttribute(
      "transform",
      `translate(0 ${(landing - 800).toFixed(1)}) translate(632 800) scale(${Math.max(0.001, s).toFixed(3)}) translate(-632 -800)`
    );

    /* --- persimmon: buoyant on the actual surface --- */
    const waterline = surfaceAt(PERSIMMON.cx);
    // floats with its base ~112 below the waterline; swamped as the flood
    // outpaces its buoyancy
    const draft = 112 + 460 * easeInOut(seg(p, 0.7, 0.8));
    const ty = Math.min(0, waterline + draft - PERSIMMON.base);
    const drift = 40 * easeInOut(seg(p, 0.58, 0.76)); // floats away down-current
    // tilts with the local slope of the liquid
    const slope = (surfaceAt(PERSIMMON.cx + 40) - surfaceAt(PERSIMMON.cx - 40)) / 80;
    const rot = clamp(-slope * 55, -7, 7) * clamp(-ty / 40, 0, 1);
    persimmon.setAttribute(
      "transform",
      `translate(${drift.toFixed(1)} ${ty.toFixed(1)}) rotate(${rot.toFixed(2)} ${PERSIMMON.cx} 878)`
    );
    // shadow dissolves both as the fruit lifts and as the spill deepens under it
    persimmonShadow.setAttribute(
      "opacity",
      Math.min(clamp(1 + ty / 28, 0, 1), clamp(1 - (moundAt(PERSIMMON.cx) + R) / 18, 0, 1)).toFixed(3)
    );
    // submersion mask: rises smoothly from the fruit's base to the waterline,
    // its edge tilted to match the local surface slope
    const deficit = moundAt(PERSIMMON.cx) + R;
    const dipY = lerp(972, waterline - ty, seg(deficit, 0.5, 14));
    const slopeDeg = Math.atan(slope) * 57.2958;
    persimmonDip.setAttribute("y", (deficit > 0.5 ? dipY : 2000).toFixed(1));
    persimmonDip.setAttribute(
      "transform",
      `rotate(${(slopeDeg - rot).toFixed(2)} ${PERSIMMON.cx} ${dipY.toFixed(1)})`
    );

    /* --- scroll hint --- */
    hint.style.opacity = 1 - seg(p, 0.0, 0.05);
  }

  function readScroll() {
    const max = track.offsetHeight - window.innerHeight;
    target = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }

  /* time-based smoothing: identical feel at 60Hz and 120Hz+ displays */
  let lastTs = 0;
  function tick(ts) {
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 1 / 60;
    lastTs = ts;
    if (reducedMotion) {
      if (shown !== target) {
        shown = target;
        apply(shown, 0);
      }
    } else {
      const d = target - shown;
      if (Math.abs(d) > 0.0004) {
        shown = shown + d * (1 - Math.exp(-9 * dt));
        apply(shown, d);
      } else if (shown !== target) {
        shown = target;
        apply(shown, 0);
      }
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", readScroll);

  // debug/test hook
  window.__setProgress = (p) => {
    target = clamp(p, 0, 1);
    shown = target;
    apply(shown, 0);
  };

  readScroll();
  shown = target;
  apply(shown, 0);
  requestAnimationFrame(tick);
})();
