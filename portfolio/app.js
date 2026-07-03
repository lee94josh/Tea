/* Scroll-scrubbed hero: pour → fill → overflow → flood.
   All motion is driven by one progress value (0–1) derived from
   scroll position within .hero-track, smoothed for fluidity. */

(function () {
  const track = document.getElementById("hero-track");
  const hint = document.getElementById("scroll-hint");

  const $ = (id) => document.getElementById(id);
  const stream = $("stream");
  const cupCoffee = $("cup-coffee");
  const overflow1 = $("overflow1");
  const overflow2 = $("overflow2");
  const puddle = $("puddle");
  const persimmon = $("persimmon");
  const persimmonShadow = $("persimmon-shadow");
  const persimmonSplash = $("persimmon-splash");
  const splash = $("splash");
  const flood = $("flood");
  const floodWave = $("flood-wave");
  const aboveFloodRect = $("above-flood-rect");
  const inFloodRect = $("in-flood-rect");

  const pot = $("pot");

  const streamLen = stream.getTotalLength();
  stream.setAttribute("stroke-dasharray", streamLen);
  stream.setAttribute("stroke-dashoffset", streamLen);

  /* Build the flood's wavy top edge: a gentle sine of amplitude 16,
     period 180, spanning wider than the canvas so it can drift. */
  (function buildWave() {
    const amp = 16;
    const half = 90;
    let d = "M-440 0";
    for (let x = -440; x < 2000; x += half * 2) {
      d += ` c ${half / 3} ${-amp}, ${(half * 2) / 3} ${-amp}, ${half} 0`;
      d += ` c ${half / 3} ${amp}, ${(half * 2) / 3} ${amp}, ${half} 0`;
    }
    d += " L2000 1400 L-440 1400 Z";
    floodWave.setAttribute("d", d);
  })();

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  // progress of P through the sub-range [a, b]
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let target = 0;
  let shown = -1; // force first paint

  function apply(p) {
    /* --- phase 0: the pot tips forward to pour (0–0.07) --- */
    const tilt = easeInOut(seg(p, 0, 0.07));
    pot.setAttribute("transform", `rotate(${lerp(-26, -36, tilt)} 960 520)`);

    /* --- phase 1: the stream draws in (0.06–0.16) --- */
    const draw = easeOut(seg(p, 0.06, 0.16));
    stream.setAttribute("stroke-dashoffset", streamLen * (1 - draw));

    /* --- phase 2: cup fills (0.16–0.30) --- */
    const fill = easeInOut(seg(p, 0.16, 0.3));
    cupCoffee.setAttribute("y", lerp(842, 786, fill));
    cupCoffee.setAttribute("height", 130);

    /* --- phase 3: overflow dome + drips (0.30–0.40) --- */
    const o1 = easeOut(seg(p, 0.3, 0.4));
    overflow1.setAttribute("opacity", o1);
    overflow1.setAttribute(
      "transform",
      `translate(634 812) scale(${lerp(0.6, 1, o1)}) translate(-634 -812)`
    );

    /* --- phase 4: the cup is engulfed (0.38–0.50) --- */
    const o2 = easeOut(seg(p, 0.38, 0.5));
    overflow2.setAttribute("opacity", o2);
    // keeps swelling slightly until the flood takes over
    const swell = lerp(0.4, 1, o2) + 0.12 * easeInOut(seg(p, 0.5, 0.6));
    overflow2.setAttribute(
      "transform",
      `translate(634 995) scale(${swell}) translate(-634 -995)`
    );

    /* --- phase 5: spill reaches the persimmon, which sinks (0.46–0.64) --- */
    const pud = easeOut(seg(p, 0.46, 0.56));
    puddle.setAttribute("opacity", pud);
    puddle.setAttribute("rx", lerp(10, 320, pud));
    puddle.setAttribute("cx", lerp(1000, 1120, pud));

    const sink = easeInOut(seg(p, 0.5, 0.64));
    const squash = lerp(1, 0.42, sink);
    persimmon.setAttribute(
      "transform",
      `translate(0 ${lerp(0, 115, sink)}) translate(1148 966) scale(1 ${squash}) translate(-1148 -966)`
    );
    persimmonShadow.setAttribute("opacity", 1 - seg(p, 0.48, 0.58));
    // splash lines pulse in while it sinks, gone once it's under
    persimmonSplash.setAttribute(
      "opacity",
      seg(p, 0.5, 0.56) * (1 - seg(p, 0.62, 0.68))
    );

    /* --- phase 6: the flood rises and takes the frame (0.54–0.94) --- */
    const fl = easeInOut(seg(p, 0.54, 0.94));
    const floodTop = lerp(1085, -180, fl);
    // slow sideways drift keeps the wavy edge feeling hand-drawn
    const driftX = Math.sin(p * 18) * 46;
    flood.setAttribute("transform", `translate(${driftX} ${floodTop})`);
    flood.style.pointerEvents = "none";

    // stream exists only above the flood surface (crest sits ~16 above the group origin)
    aboveFloodRect.setAttribute("height", Math.max(0, floodTop - 16 + 200));
    // cream typography is revealed by the flood
    inFloodRect.setAttribute("y", floodTop + 2);

    /* --- splash rides the surface --- */
    // at the cup until the flood passes it, then on the flood surface;
    // it disappears together with the stream, when the surface reaches the spout
    const surfaceY = Math.min(800, floodTop - 8);
    const splashOn = seg(p, 0.14, 0.18); // appears when the stream lands
    const splashOff = clamp((floodTop - 500) / 60, 0, 1); // fades as the spout submerges
    const wiggle = Math.sin(p * 90) * 4;
    splash.setAttribute(
      "opacity",
      Math.min(splashOn, splashOff)
    );
    splash.setAttribute(
      "transform",
      `translate(${wiggle} ${surfaceY - 800}) rotate(${wiggle * 0.4} 634 800)`
    );

    /* --- scroll hint --- */
    hint.style.opacity = 1 - seg(p, 0.0, 0.05);
  }

  function readScroll() {
    const max = track.offsetHeight - window.innerHeight;
    target = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }

  function tick() {
    if (reducedMotion) {
      if (shown !== target) {
        shown = target;
        apply(shown);
      }
    } else {
      const d = target - shown;
      if (Math.abs(d) > 0.0004) {
        shown = shown + d * 0.14;
        apply(shown);
      } else if (shown !== target) {
        shown = target;
        apply(shown);
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
    apply(shown);
  };

  readScroll();
  shown = target;
  apply(shown);
  requestAnimationFrame(tick);
})();
