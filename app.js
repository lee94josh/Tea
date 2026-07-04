/* Scroll-scrubbed hero — a continuous liquid simulation.
   One progress value (0–1) drives: the pot tilting into the pour, the
   stream (with a falling droplet head), the cup filling level by level,
   a meniscus lens that grows into the overflow dome, drips, a glaze
   skirt, and one unified liquid body — surface(x) = table − spreading
   mound − flood rise + traveling wave, displaced by floating bodies and
   the pour's dimple — whose path is rebuilt every frame. Scene shapes
   come from Haley's vector export (frame-03-source.svg). */

(function () {
  const track = document.getElementById("hero-track");
  const hint = document.getElementById("scroll-hint");

  const $ = (id) => document.getElementById(id);
  const potSwing = $("pot-swing");
  const stream = $("stream"); // hidden spine: geometry input only
  const streamBody = $("stream-body"); // the rendered single-contour stream
  const streamSway = $("stream-sway");
  const cupCoffee = $("cup-coffee");
  const drips = [$("drip0"), $("drip1"), $("drip2"), $("drip3")];
  const sheet = $("sheet");
  const liquid = $("liquid");
  const liquidClip = $("liquid-clip-path");
  const persimmon = $("persimmon");
  const persimmonShadow = $("persimmon-shadow");
  const fruitPuddle = $("fruit-puddle");
  const splash = $("splash");
  const cupShadow = $("cup-shadow");
  const cupHandle = $("cup-handle");
  const ripples = [$("ripple0"), $("ripple1")];
  const fallDrops = [$("fall-drop0"), $("fall-drop1")];
  const workTease = $("work-tease");

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
  const PERSIMMON = { cx: 1148, base: 967.21 };
  const STREAM_X = 632;
  const IMPACT_Y = 800;

  /* stream spine lookup: position, unit tangent and normal at arc length,
     so the stream body can be traced as one contour around the spine and
     ended exactly at any landing height */
  const streamLen = stream.getTotalLength();
  const streamLUT = [];
  {
    const K = 120;
    for (let i = 0; i <= K; i++) {
      const l = (streamLen * i) / K;
      const pt = stream.getPointAtLength(l);
      streamLUT.push({ l, x: pt.x, y: pt.y, tx: 0, ty: 0, nx: 0, ny: 0 });
    }
    for (let i = 0; i <= K; i++) {
      const a = streamLUT[Math.max(0, i - 1)], b = streamLUT[Math.min(K, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1;
      streamLUT[i].tx = dx / m; streamLUT[i].ty = dy / m;
      streamLUT[i].nx = -dy / m; streamLUT[i].ny = dx / m;
    }
  }
  function sampleSpine(l) {
    l = clamp(l, 0, streamLen);
    const f = (l / streamLen) * (streamLUT.length - 1);
    const i = Math.min(streamLUT.length - 2, Math.floor(f));
    const t = f - i, a = streamLUT[i], b = streamLUT[i + 1];
    return {
      x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
      tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t),
      nx: lerp(a.nx, b.nx, t), ny: lerp(a.ny, b.ny, t),
    };
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

  /* One closed contour for the stream: right flank out from the spout,
     rounded tip cap, left flank back — all from a width profile.
     While falling, the tip gathers into a droplet head with a neck
     behind it; once landed, the end flares at contact and the contour
     closes BELOW the surface, merging into the pool with no seam. */
  function buildStreamPath(shownLen, tipFree) {
    if (shownLen < 6) return "";
    const endLen = tipFree ? shownLen : Math.min(streamLen, shownLen + 10);
    const right = [], left = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const l = (endLen * i) / N;
      const s = sampleSpine(l);
      const u = l / streamLen;
      // her stroke was 24 wide: taper gently as the fall accelerates
      let hw = lerp(13.2, 9.6, u) + 1.6 * Math.exp(-l / 30);
      if (tipFree) {
        // neck behind the head, then the gathered droplet head itself
        // (the head grows in as the stream establishes, so the first
        // instants read as liquid swelling from the beak, not a blob)
        const headScale = clamp(endLen / 80, 0, 1);
        hw *= 1 - 0.32 * headScale * Math.exp(-Math.pow((endLen - 46 - l) / 20, 2));
        hw += 6 * headScale * Math.exp(-Math.pow((endLen - l) / 24, 2));
      } else {
        hw *= 1 + 0.28 * Math.exp(-Math.pow((endLen - l) / 30, 2)); // piles at contact
      }
      right.push([s.x + s.nx * hw, s.y + s.ny * hw]);
      left.push([s.x - s.nx * hw, s.y - s.ny * hw]);
    }
    // rounded tip cap, traced as part of the same boundary
    const e = sampleSpine(endLen);
    const capR = tipFree ? 6 + lerp(13.2, 9.6, endLen / streamLen) * 0.72 : 10;
    const cap = [];
    for (const a of [0.45, 0.95, Math.PI / 2, 2.2, 2.7]) {
      cap.push([
        e.x + capR * (Math.cos(a) * e.nx + Math.sin(a) * e.tx),
        e.y + capR * (Math.cos(a) * e.ny + Math.sin(a) * e.ty),
      ]);
    }
    // the spout end closes via the smooth wrap of the closed path itself —
    // a curved segment, hidden behind the pot's beak
    const pts = right.concat(cap, left.reverse());
    return smoothClosedPath(pts);
  }

  /* Catmull-Rom through samples → one closed path of cubic segments,
     regenerated from scratch every frame (never morphed). */
  function smoothClosedPath(pts) {
    const n = pts.length;
    if (n < 3) return "";
    let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d + " Z";
  }

  /* drip dash setup */
  const dripLens = drips.map((d) => d.getTotalLength());
  drips.forEach((d, i) => {
    d.setAttribute("stroke-dasharray", dripLens[i]);
    d.setAttribute("stroke-dashoffset", dripLens[i]);
  });
  const dripWindows = [ [0.325, 0.43], [0.35, 0.44], [0.335, 0.45], [0.31, 0.415] ];

  /* falling droplets pinching off the skirt lobes: [x, y0, y1, start, end] */
  const dropSpecs = [ [585, 902, 956, 0.425, 0.478], [700, 920, 958, 0.452, 0.505] ];

  /* bowl half-width at height y (straight rim corners rounding into a
     177.54-radius bottom, from the exported cup path) */
  function bowlHW(y) {
    const dy = y - CUP.top;
    if (dy <= 0) return 187;
    if (dy >= CUP.r) return 12;
    return 9.455 + Math.sqrt(Math.max(0, CUP.r * CUP.r - dy * dy));
  }

  /* the meniscus/dome lens: bottom arc hugs the rim, top arc bulges */
  function lensPath(cx, cy, rx, ryB, ryT) {
    if (rx <= 1) return "";
    return (
      `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)}` +
      ` A${rx.toFixed(1)} ${ryB.toFixed(1)} 0 0 0 ${(cx + rx).toFixed(1)} ${cy.toFixed(1)}` +
      ` A${rx.toFixed(1)} ${ryT.toFixed(1)} 0 0 0 ${(cx - rx).toFixed(1)} ${cy.toFixed(1)} Z`
    );
  }

  /* ---------- the unified liquid surface ---------- */
  let H = 0, W = 300, R = 0, AMP = 0, PHASE = 0, DIMPLE = 0, FB_A = 0, FB_X = PERSIMMON.cx;
  function moundAt(x) {
    const g = Math.exp(-((x - CUP.cx) * (x - CUP.cx)) / (W * W));
    return H * g;
  }
  // base surface: mound + flood + wave + the pour's dimple
  function surfaceCore(x) {
    let y = TABLE_Y - moundAt(x) - R + AMP * Math.sin(x * 0.02 + PHASE);
    if (DIMPLE > 0.01) y += DIMPLE * Math.exp(-((x - STREAM_X) * (x - STREAM_X)) / (58 * 58));
    return y;
  }
  // rendered surface: displaced upward around the floating persimmon
  function surfaceAt(x) {
    let y = surfaceCore(x);
    if (FB_A > 0.01) y -= FB_A * Math.exp(-((x - FB_X) * (x - FB_X)) / (125 * 125));
    return y;
  }
  // liquid depth below the table line: rises to a flat plateau (below the
  // canvas) wherever liquid stands more than ~8px deep, so submerged
  // geometry is covered by one system with no seams
  function depthAt(x) {
    const deficit = moundAt(x) + R;
    return Math.min(R * 4, 760) + 250 * easeInOut(clamp(deficit / 2.5, 0, 1));
  }
  function buildLiquidPath() {
    if (H < 0.5 && R < 0.5 && FB_A < 0.5) return "";
    let d = `M-20 ${surfaceAt(-20).toFixed(1)}`;
    for (let x = 4; x <= 1690; x += 24) {
      d += ` L${x} ${surfaceAt(x).toFixed(1)}`;
    }
    for (let x = 1690; x >= -20; x -= 48) {
      d += ` L${x} ${(TABLE_Y + 2 + depthAt(x)).toFixed(1)}`;
    }
    d += " Z";
    return d;
  }

  /* ---------- the glaze skirt sliding down the cup ---------- */
  const LOBE_ENDS = [0.18, 0.42, 0.58, 0.83, 1.0];
  const LOBE_DEPTHS = [34, 12, 42, 10, 28];
  function buildSkirtPath(sp) {
    if (sp <= 0) return "";
    const yTop = 823;
    const yB = Math.min(lerp(842, 994, sp), 990);
    const cx = CUP.cx;
    let d = `M${(cx - bowlHW(yTop) - 6).toFixed(1)} ${yTop}`;
    for (let t = 0.1; t <= 1.001; t += 0.1) {
      const y = lerp(yTop, yB, t);
      d += ` L${(cx - bowlHW(y) - 6).toFixed(1)} ${y.toFixed(1)}`;
    }
    // rounded hanging drip-lobes, kept inside the bowl so the clip never
    // slices them flat
    const hb = bowlHW(yB) - 4;
    let xPrev = cx - hb;
    LOBE_ENDS.forEach((end, i) => {
      const xEnd = lerp(cx - hb, cx + hb, end);
      const depth = LOBE_DEPTHS[i] * sp * 1.5;
      d += ` C${(xPrev + (xEnd - xPrev) * 0.2).toFixed(1)} ${(yB + depth).toFixed(1)}, ${(xPrev + (xEnd - xPrev) * 0.8).toFixed(1)} ${(yB + depth).toFixed(1)}, ${xEnd.toFixed(1)} ${yB.toFixed(1)}`;
      xPrev = xEnd;
    });
    for (let t = 0.9; t >= -0.001; t -= 0.1) {
      const y = lerp(yTop, yB, t);
      d += ` L${(cx + bowlHW(y) + 6).toFixed(1)} ${y.toFixed(1)}`;
    }
    d += " Z";
    return d;
  }

  function ringPath(x, y, rx) {
    const ry = rx * 0.26;
    return (
      `M${(x - rx).toFixed(1)} ${y.toFixed(1)}` +
      ` A${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(x + rx).toFixed(1)} ${y.toFixed(1)}` +
      ` A${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(x - rx).toFixed(1)} ${y.toFixed(1)}`
    );
  }

  let target = 0;
  let shown = -1; // force first paint

  function apply(p, vel) {
    /* --- the pot tilts into the pour, pivoting in the grip; scroll
       velocity leans it a touch further (inertia) --- */
    // easeOutBack gives the pour a tiny settle-overshoot at the end of the tilt
    const lean = clamp(vel * 160, -4, 4);
    const tilt = lerp(-12, 0, easeOutBack(seg(p, 0, 0.085))) + lean;
    potSwing.setAttribute("transform", `rotate(${tilt.toFixed(2)} ${RING.cx} ${RING.cy})`);
    const sway = clamp(vel * 220, -6, 6);
    streamSway.setAttribute(
      "transform",
      `translate(772.56 494.57) skewX(${(-sway).toFixed(2)}) translate(-772.56 -494.57)`
    );

    /* --- cup fill → meniscus → overflow dome, as one lens --- */
    const level = easeInOut(seg(p, 0.145, 0.3));
    const bulge = easeInOut(seg(p, 0.3, 0.35));
    const domeP = easeInOut(seg(p, 0.36, 0.52));
    let cy = lerp(lerp(839, CUP.rimY, level), 823.5, bulge);
    let rx = level <= 0 ? 0 : lerp(lerp(92, CUP.rimRx, level), 192, bulge);
    let ryT = lerp(lerp(17, CUP.rimRy, level), 48, bulge);
    let ryB = lerp(lerp(17, CUP.rimRy, level), 42, bulge);
    rx = lerp(rx, 196.5, domeP);
    ryT = lerp(ryT, 62, domeP);
    ryB = lerp(ryB, 44.5, domeP);
    cupCoffee.setAttribute("d", lensPath(CUP.cx, cy, rx, ryB, ryT));
    const domeApex = cy - ryT;

    /* --- drips run down the bowl, accelerating like falling liquid --- */
    drips.forEach((d, i) => {
      const dp = easeIn(seg(p, dripWindows[i][0], dripWindows[i][1]));
      d.setAttribute("stroke-dashoffset", dripLens[i] * (1 - dp));
    });

    /* --- glaze skirt slides down over the cup --- */
    sheet.setAttribute("d", buildSkirtPath(domeP));

    /* --- droplets pinch off the skirt lobes and fall --- */
    fallDrops.forEach((el, i) => {
      const [x, y0, y1, s0, s1] = dropSpecs[i];
      const dp = seg(p, s0, s1);
      if (dp > 0 && dp < 1) {
        el.setAttribute("cx", x);
        el.setAttribute("cy", lerp(y0, y1, easeIn(dp)).toFixed(1));
        el.setAttribute("opacity", (seg(dp, 0, 0.15) * (1 - seg(dp, 0.85, 1))).toFixed(3));
      } else {
        el.setAttribute("opacity", 0);
      }
    });

    /* --- unified liquid: mound spreads, then the flood takes the frame --- */
    const moundP = easeInOut(seg(p, 0.42, 0.66));
    const floodP = easeInOut(seg(p, 0.6, 0.94));
    R = floodP * 1140;
    H = moundP * 192 * (1 - 0.85 * seg(R, 0, 500));
    W = lerp(240, 570, moundP);
    AMP = 12 * seg(R, 20, 180) * (1 - 0.35 * seg(R, 760, 1140));
    PHASE = 2 + p * 5;

    // the pour dimples open liquid at the landing point
    const sNoDimple = TABLE_Y - moundAt(STREAM_X) - R + AMP * Math.sin(STREAM_X * 0.02 + PHASE);
    const dimpleActive = clamp((IMPACT_Y - sNoDimple) / 60, 0, 1) * clamp((sNoDimple - 545) / 50, 0, 1);
    DIMPLE = 9 * dimpleActive;

    /* --- persimmon: buoyant on the actual surface --- */
    const drift = 40 * easeInOut(seg(p, 0.58, 0.76));
    FB_X = PERSIMMON.cx + drift;
    FB_A = 0; // fruit displacement is set after buoyancy below
    const waterline = surfaceCore(FB_X);
    const draft = 112 + 460 * easeInOut(seg(p, 0.7, 0.8));
    const ty = Math.min(0, waterline + draft - PERSIMMON.base);
    const slope = (surfaceCore(FB_X + 40) - surfaceCore(FB_X - 40)) / 80;
    const rot = clamp(-slope * 55, -7, 7) * clamp(-ty / 40, 0, 1);
    persimmon.setAttribute(
      "transform",
      `translate(${drift.toFixed(1)} ${ty.toFixed(1)}) rotate(${rot.toFixed(2)} ${PERSIMMON.cx} 878)`
    );
    const fruitDeficit = moundAt(PERSIMMON.cx) + R;
    persimmonShadow.setAttribute(
      "opacity",
      Math.min(clamp(1 + ty / 28, 0, 1), 1 - seg(fruitDeficit, 2, 9)).toFixed(3)
    );
    // the puddle front sweeps toward the viewer across the fruit's footprint
    fruitPuddle.setAttribute("height", (105 * easeInOut(seg(fruitDeficit, 0.1, 1.2))).toFixed(1));
    // the floating fruit lifts the surface around itself
    FB_A = clamp(-ty * 0.15, 0, 13) * (1 - seg(p, 0.72, 0.8));

    /* --- build the liquid body --- */
    const liquidD = buildLiquidPath();
    liquid.setAttribute("d", liquidD);
    liquidClip.setAttribute("d", liquidD);
    cupShadow.setAttribute("opacity", (1 - seg(moundP, 0.4, 0.75)).toFixed(3));
    cupHandle.setAttribute("opacity", (1 - seg(moundAt(430) + R, 18, 45)).toFixed(3));

    /* --- the stream always ends ON the landing surface --- */
    let landing = IMPACT_Y + 2;
    if (bulge > 0) landing = Math.min(landing, domeApex + 4);
    landing = Math.min(landing, surfaceCore(STREAM_X));
    // falling liquid accelerates: ease-in on the draw
    const draw = easeIn(seg(p, 0.06, 0.14));
    const lenAtLanding = streamLenAtY(landing);
    const shownLen = Math.min(draw * streamLen, lenAtLanding);
    // the tip is free (gathered droplet head) until it reaches the surface
    const tipFree = shownLen < lenAtLanding - 2;
    streamBody.setAttribute("d", buildStreamPath(shownLen, tipFree));

    /* --- splash scales in softly at the landing, rides the surface --- */
    const splashIn = easeOutBack(seg(p, 0.138, 0.172));
    const splashOut = clamp((landing - 540) / 50, 0, 1);
    const s = splashIn * splashOut;
    splash.setAttribute("opacity", clamp(s * 1.4, 0, 1).toFixed(3));
    splash.setAttribute(
      "transform",
      `translate(0 ${(landing - IMPACT_Y).toFixed(1)}) translate(632 800) scale(${Math.max(0.001, s).toFixed(3)}) translate(-632 -800)`
    );

    /* --- ripples expand from the landing on open liquid --- */
    const ripActive = dimpleActive * splashOut * clamp((shownLen / streamLen - 0.05) * 10, 0, 1);
    ripples.forEach((el, i) => {
      const ph = (p * 9 + i * 0.5) % 1;
      const rrx = 26 + ph * 130;
      el.setAttribute("d", ringPath(STREAM_X, landing + 10, rrx));
      el.setAttribute("opacity", (ripActive * (1 - ph) * seg(ph, 0, 0.08) * 0.85).toFixed(3));
    });

    /* --- the release: SELECTED WORK rises out of the liquid --- */
    const tp = seg(p, 0.92, 1);
    workTease.setAttribute("opacity", seg(p, 0.92, 0.97).toFixed(3));
    workTease.setAttribute("transform", `translate(0 ${lerp(48, 0, easeOut(tp)).toFixed(1)})`);

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
