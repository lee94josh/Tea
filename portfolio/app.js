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
  const liquid = $("liquid");
  const liquidBack = $("liquid-back");
  const liquidClip = $("liquid-clip-path");
  const persimmon = $("persimmon");
  const persimmonShadow = $("persimmon-shadow");
  const splash = $("splash");
  const cupShadow = $("cup-shadow");
  const ripples = [$("ripple0"), $("ripple1")];
  const fallDrops = [$("fall-drop0"), $("fall-drop1")];
  const workTease = $("work-tease");

  // fail soft if the markup and script versions ever mismatch (e.g. a
  // stale cached HTML): show the static scene instead of a dead page
  const required = [track, hint, potSwing, stream, streamBody, cupCoffee, liquid,
    liquidBack, liquidClip, persimmon, persimmonShadow, splash, cupShadow,
    workTease].concat(ripples);
  if (required.some((el) => !el)) {
    console.warn("hero: markup/script version mismatch — animation disabled");
    return;
  }

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

  /* One closed contour for the stream: rounded back-cap into the beak,
     right flank down, rounded tip cap, left flank back — all from a
     width profile. While falling, the tip gathers into a droplet head
     with a neck behind it; once landed, the end flares at contact and
     the contour closes BELOW the surface, merging into the pool.
     The spine's top is warped to follow the pot's rotation (decaying to
     zero at the landing), so the pour always leaves the beak. */
  function buildStreamPath(shownLen, tipFree, tiltDeg) {
    if (shownLen < 6) return "";
    const endLen = tipFree ? shownLen : Math.min(streamLen, shownLen + 10);
    const tiltRad = (tiltDeg * Math.PI) / 180;
    const headScale = clamp(endLen / 80, 0, 1);

    // spine frame at arc length l, rotated about the ring by the pot's
    // tilt. The first 80px rotate RIGIDLY with the pot — the whole
    // beak-cover region stays congruent to its rest pose under any
    // rotation — then influence fades downstream so the landing stays put
    function frameAt(l) {
      const s = sampleSpine(l);
      const a = tiltRad * (l <= 80 ? 1 : Math.exp(-(l - 80) / 130));
      if (Math.abs(a) < 1e-4) return s;
      const c = Math.cos(a), sn = Math.sin(a);
      const dx = s.x - RING.cx, dy = s.y - RING.cy;
      return {
        x: RING.cx + dx * c - dy * sn,
        y: RING.cy + dx * sn + dy * c,
        tx: s.tx * c - s.ty * sn, ty: s.tx * sn + s.ty * c,
        nx: s.nx * c - s.ny * sn, ny: s.nx * sn + s.ny * c,
      };
    }
    function halfW(l) {
      const u = l / streamLen;
      // her stroke was 24 wide: taper gently as the fall accelerates
      let hw = lerp(13.2, 9.6, u) + 1.2 * Math.exp(-l / 34);
      if (tipFree) {
        // neck behind the head, then the gathered droplet head itself
        hw *= 1 - 0.26 * headScale * Math.exp(-Math.pow((endLen - 48 - l) / 24, 2));
        hw += 6 * headScale * Math.exp(-Math.pow((endLen - l) / 24, 2));
      } else {
        hw *= 1 + 0.28 * Math.exp(-Math.pow((endLen - l) / 30, 2)); // piles at contact
      }
      return hw;
    }

    const right = [], left = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const l = (endLen * i) / N;
      const f = frameAt(l), hw = halfW(l);
      right.push([f.x + f.nx * hw, f.y + f.ny * hw]);
      left.push([f.x - f.nx * hw, f.y - f.ny * hw]);
    }
    // tip cap: radius equals the flank width at the end, so the cap
    // joins the flanks with no nub
    const e = frameAt(endLen), capR = halfW(endLen);
    const cap = [];
    for (const a of [0.45, 0.95, Math.PI / 2, 2.2, 2.7]) {
      cap.push([
        e.x + capR * (Math.cos(a) * e.nx + Math.sin(a) * e.tx),
        e.y + capR * (Math.cos(a) * e.ny + Math.sin(a) * e.ty),
      ]);
    }
    // explicit rounded back-cap bulging into the beak (hidden by the
    // pot, but curved and controlled — no wrap-closure lumps)
    const b0 = frameAt(0), backR = halfW(0);
    const back = [];
    for (const a of [2.7, 2.1, Math.PI / 2, 1.05, 0.45]) {
      back.push([
        b0.x + backR * (Math.cos(a) * b0.nx - Math.sin(a) * b0.tx),
        b0.y + backR * (Math.cos(a) * b0.ny - Math.sin(a) * b0.ty),
      ]);
    }
    const pts = right.concat(cap, left.reverse(), back);
    return smoothClosedPath(pts);
  }

  /* Catmull-Rom through samples → one closed path of cubic segments,
     regenerated from scratch every frame (never morphed). */
  function smoothClosedPath(raw) {
    // drop near-duplicate consecutive points (incl. last vs first) — a
    // repeated vertex gives Catmull-Rom a zero-length segment whose control
    // points overshoot into a hairline cusp
    const pts = [];
    for (const p of raw) {
      const q = pts[pts.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.3) pts.push(p);
    }
    while (pts.length > 1 && Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < 0.3) pts.pop();
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

  /* the cup's drips: fixed positions and personalities; length is driven
     per frame and capped at the pool surface (they feed it, then submerge
     as it rises past them) */
  const DRIPS = [
    { x: 505, neckHalf: 10, beadR: 10.5, s0: 0.335 },
    { x: 566, neckHalf: 7.5, beadR: 7, s0: 0.375 },
    { x: 700, neckHalf: 8.5, beadR: 8.5, s0: 0.355 },
    { x: 766, neckHalf: 11, beadR: 11.5, s0: 0.32 },
  ];

  /* drip half-width profile along its spine, s ∈ [0..1] top→tip: fillet
     into the cap, tapering shaft, bead max AT the tip (teardrop terminus).
     The bead's sigma widens for young drips so a nascent drip is ONE convex
     lobe — the distinct tip bead only forms once the run is established —
     and shaft/bead blend through a smooth max so the waist never creases. */
  function dripHalfWidth(s, neckHalf, beadR, wScale) {
    const fillet = neckHalf * 0.9 * Math.exp(-s * 2.6);
    const shaft = neckHalf * (0.92 - 0.22 * s);
    const sig = 0.34 + 0.4 * (1 - wScale);
    const bead = beadR * Math.exp(-Math.pow((s - 1) / sig, 2));
    const body = Math.pow(Math.pow(shaft, 4) + Math.pow(bead, 4), 0.25);
    return (body + fillet) * wScale;
  }

  /* ONE closed contour for all liquid on the cup: elliptical dome top,
     rim-wrap corners, and an underside arc whose walk dives down and
     around every drip it crosses. Pre-overflow (wrapP 0, no drips) this
     degenerates to the plain fill lens — one shape through the whole life. */
  function cupCapContour(cy, rx, ryB, ryT, wrapP, dripList) {
    if (rx <= 2) return "";
    const cx = CUP.cx;
    const pts = [];
    const T = 20;
    // — top arc, left → right —
    for (let i = 0; i <= T; i++) {
      const th = Math.PI - (Math.PI * i) / T;
      pts.push([cx + rx * Math.cos(th), cy - ryT * Math.sin(th)]);
    }
    // — underside arc, right → left, with drip excursions; the corner
    // vertices (cx±rx, cy) belong to the top arc alone, so the walk runs
    // 1…T−1 — a doubled corner point cusps under Catmull-Rom —
    const active = dripList
      .filter((d) => d.len > 5)
      .sort((a, b) => b.x - a.x);
    let di = 0;
    let barrier = pts.length; // don't pop past the top arc or a prior drip
    let clearX = Infinity; // skip arc samples inside the last drip's footprint
    for (let i = 1; i <= T - 1; i++) {
      const th = (Math.PI * i) / T;
      const x = cx + rx * Math.cos(th);
      const y = cy + ryB * Math.sin(th);
      // dive around any drip we just crossed
      while (di < active.length && active[di].x >= x) {
        const d = active[di++];
        // drips EMERGE: width scales in with establishment, so a nascent
        // drip is a tiny swelling of the edge, never a detached dot
        const wScale = Math.pow(clamp(d.len / 30, 0, 1), 0.7);
        const lipY = cy + ryB * Math.sqrt(Math.max(0, 1 - Math.pow((d.x - cx) / rx, 2)));
        const w0 = dripHalfWidth(0, d.neckHalf, d.beadR, wScale);
        // the flare must OWN its footprint on the lip: any arc sample left
        // inside it makes the boundary double back, and that reversed
        // micro-loop cancels the fill winding — a torn seam at the junction
        while (pts.length > barrier && pts[pts.length - 1][0] < d.x + w0 + 2) pts.pop();
        const S = 9;
        const driftDir = d.x < cx ? 1 : -1;
        const drift = (dy) => driftDir * Math.min(9, dy * 0.05);
        for (let k = 0; k <= S; k++) {
          const s = k / S, dy = s * d.len;
          pts.push([d.x + drift(dy) + dripHalfWidth(s, d.neckHalf, d.beadR, wScale), lipY + dy]);
        }
        const cap = dripHalfWidth(1, d.neckHalf, d.beadR, wScale);
        const tipX = d.x + drift(d.len);
        for (const a of [0.28, 0.7, 1.12, Math.PI / 2, 2.02, 2.44, 2.86]) {
          pts.push([tipX + cap * Math.cos(a), lipY + d.len + cap * Math.sin(a)]);
        }
        for (let k = S; k >= 0; k--) {
          const s = k / S, dy = s * d.len;
          pts.push([d.x + drift(dy) - dripHalfWidth(s, d.neckHalf, d.beadR, wScale), lipY + dy]);
        }
        barrier = pts.length;
        clearX = d.x - w0 - 2;
      }
      if (x > clearX) continue;
      pts.push([x, y]);
    }
    return smoothClosedPath(pts);
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
  /* ---- the two curtains: one surface, rendered twice ----
     BACK: the pool body behind all objects — the horizon silhouette.
     FRONT: the pool's LEADING EDGE. It starts at the front floor plane —
     below the shadows, below every object's base — and climbs with local
     depth, so the film first erases the shadows, then creeps up each
     object from its own base the moment it reaches that base's height,
     and finally converges onto the horizon surface (deficit ≈ 187) so
     the two curtains become one before the flood. */
  const WATERLINE_K = 1.8; // waterline climb per unit of local pool depth
  const FRONT_Y = 1045; // the front floor plane: where the leading edge is born
  function frontTopAt(x) {
    // max = the lower line on screen: the front lags the horizon until
    // it catches up, then they are the same surface
    return Math.max(surfaceAt(x), FRONT_Y - WATERLINE_K * (moundAt(x) + R));
  }
  function buildCurtain(topFn) {
    if (H < 0.5 && R < 0.5) return "";
    let d = `M-20 ${topFn(-20).toFixed(1)}`;
    for (let x = 4; x <= 1690; x += 24) {
      d += ` L${x} ${topFn(x).toFixed(1)}`;
    }
    d += " L1690 1100 L-20 1100 Z";
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
    // (the stream follows the pot via the spine warp in buildStreamPath —
    // no skew trick needed)

    /* --- all liquid on the cup, as ONE contour: fill lens → meniscus →
       rim wrap, with drips growing as excursions of the same boundary --- */
    const level = easeInOut(seg(p, 0.145, 0.3));
    const bulge = easeInOut(seg(p, 0.3, 0.36));
    const wrapP = easeInOut(seg(p, 0.33, 0.41));
    let cy = lerp(lerp(839, CUP.rimY, level), 823.5, bulge);
    let rx = level <= 0 ? 0 : lerp(lerp(92, CUP.rimRx, level), 176, bulge);
    let ryT = lerp(lerp(17, CUP.rimRy, level), 42, bulge);
    let ryB = lerp(lerp(17, CUP.rimRy, level), 45, bulge);
    rx = lerp(rx, 188.5, wrapP);
    ryT = lerp(ryT, 50, wrapP);
    ryB = lerp(ryB, 48.5, wrapP);
    const dripList = DRIPS.map((d) => {
      const lipY = cy + ryB * Math.sqrt(Math.max(0, 1 - Math.pow((d.x - CUP.cx) / Math.max(rx, 1), 2)));
      const maxLen = 985 - lipY; // runs the bowl's face down to its base
      return {
        x: d.x, neckHalf: d.neckHalf, beadR: d.beadR,
        len: maxLen * easeIn(seg(p, d.s0, d.s0 + 0.17)) * wrapP,
      };
    });
    cupCoffee.setAttribute("d", cupCapContour(cy, rx, ryB, ryT, wrapP, dripList));
    const domeApex = cy - ryT;

    /* --- the pool: fed by the drips, it rises FROM THE TABLE — a wide,
       low puddle around the base that climbs the bowl and submerges the
       cup bottom-up, then hands off to the flood --- */
    const moundP = easeInOut(seg(p, 0.44, 0.68));
    const floodP = easeInOut(seg(p, 0.6, 0.94));
    R = floodP * 1140;
    H = moundP * 230 * (1 - 0.85 * seg(R, 0, 500));
    W = lerp(430, 640, moundP);
    AMP = 12 * seg(R, 20, 180) * (1 - 0.35 * seg(R, 760, 1140));
    PHASE = 2 + p * 5;

    // the pour dimples open liquid at the landing point
    const sNoDimple = TABLE_Y - moundAt(STREAM_X) - R + AMP * Math.sin(STREAM_X * 0.02 + PHASE);
    const dimpleActive = clamp((IMPACT_Y - sNoDimple) / 60, 0, 1) * clamp((sNoDimple - 545) / 50, 0, 1);
    DIMPLE = 9 * dimpleActive;

    /* --- persimmon: in FRONT of the pool. Its own waterline starts at
       its base and climbs as the local pool deepens — the fruit floats
       when it has displaced enough, drifts down-current, and is swamped
       when its growing draft outruns the surface. It rides whichever
       water level is REAL at its column: the amplified waterline while
       the pool approaches, the actual surface after the crossover —
       never higher, so it can't levitate above the liquid. --- */
    const drift = 40 * easeInOut(seg(p, 0.58, 0.76));
    FB_X = PERSIMMON.cx + drift;
    FB_A = 0; // fruit displacement is set after buoyancy below
    const fruitDeficit = moundAt(PERSIMMON.cx) + R;
    // the fruit rides the same front waterline as everything else: born
    // at the floor plane, it reaches the fruit's base, creeps up it, and
    // only then displaces enough to lift it
    const fruitWater =
      FRONT_Y - WATERLINE_K * fruitDeficit + AMP * 0.6 * Math.sin(FB_X * 0.02 + PHASE);
    const waterAtFruit = Math.max(fruitWater, surfaceCore(FB_X));
    const draft = 100 + 460 * easeInOut(seg(p, 0.7, 0.8));
    const ty = Math.min(0, waterAtFruit + draft - PERSIMMON.base);
    const slope = (surfaceCore(FB_X + 40) - surfaceCore(FB_X - 40)) / 80;
    const rot = clamp(-slope * 55, -7, 7) * clamp(-ty / 40, 0, 1);
    persimmon.setAttribute(
      "transform",
      `translate(${drift.toFixed(1)} ${ty.toFixed(1)}) rotate(${rot.toFixed(2)} ${PERSIMMON.cx} 878)`
    );
    // the shadow dims gradually as the film spreads over it — driven by
    // the LOCAL pool depth, in step with the leading edge covering it
    persimmonShadow.setAttribute(
      "opacity",
      Math.min(clamp(1 + ty / 28, 0, 1), 1 - seg(fruitDeficit, 6, 45)).toFixed(3)
    );
    // the floating fruit lifts the surface around itself
    FB_A = clamp(-ty * 0.15, 0, 13) * (1 - seg(p, 0.72, 0.8));

    /* --- the two curtains --- */
    const cupDeficit = moundAt(CUP.cx) + R;
    liquidBack.setAttribute("d", buildCurtain(surfaceAt));
    const frontD = buildCurtain(frontTopAt);
    liquid.setAttribute("d", frontD);
    liquidClip.setAttribute("d", frontD);
    cupShadow.setAttribute("opacity", (1 - seg(cupDeficit, 6, 45)).toFixed(3));

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
    streamBody.setAttribute("d", buildStreamPath(shownLen, tipFree, tilt));

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
