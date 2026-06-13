# The Intent Thesis

How Lookback decides whether a photo deserves a feature article.

## Thesis

**A photo is a vote of attention.** The question is never "what can we identify
in this image?" — it's "what did this person deliberately point their camera
at, and does that subject open onto a story worth 500 words?"

Intent is inferred, not declared. Its signals, strongest first:

1. **Framing** — what the photo is *OF* vs. what's merely *IN* it. A painting
   shot straight-on is a subject; a painting behind brunch is decor. A logo on
   a mug is incidental; a marquee filling the frame is the point.
2. **Specificity** — named, particular things (Mr. Cheeks, a Jafa installation,
   a paebaek ceremony) carry intent; categories and commodities (coffee, a
   MacBook, "a salad") do not. Brands are almost never subjects.
3. **Effort** — places traveled to, events attended, meals sought out, museums
   queued for. Ambient daily life (desk, commute, kitchen counter) is not effort.
4. **Recurrence** — multiple frames of one subject is the camera saying
   "this, specifically."
5. **Story depth** — the reader is a curious person who loves food, design,
   art, history, and culture. The subject must reward that curiosity: a
   history, a maker, a craft, a tradition. If the best possible article is
   encyclopedia boilerplate, it fails.

One more rule downstream of intent: **one article per subject** — a restaurant
gets a single definitive piece covering its history, people, design, and food,
never fragments.

## The canon (worked examples)

| Photo | Verdict | Why |
| --- | --- | --- |
| Korean wedding ceremony, traditional hanbok | ✅ the ceremony tradition | attended event + cultural depth |
| Mug with a NASA logo on a desk | ❌ nothing | incidental logo ≠ interest in NASA |
| Tasting menu at a named restaurant | ✅ ONE article: the restaurant | effort + specificity; dishes fold into it |
| A painting photographed at a museum | ✅ the artist / the work | framed subject + art-history depth |
| MacBook and tea on a desk | ❌ nothing | ambient; not Apple, not Steve Jobs |
| Concert at Brooklyn Paramount | ✅ the performer (venue too if storied) | attended + specific |
| Friend's tattoo of Hokusai's Great Wave | ✅ the artwork | deliberately framed art reference |
| Generic skyline / brownstones / fire escapes | ❌ nothing | scenery, not subject |
| Receipt, screenshot, whiteboard | ❌ nothing | utility capture |
| Close-up of a distinctive cultural dish | ⚠ venue is usually the better single article; the dish tradition only when it IS the story | deliberate but easily over-read |
| Eames chair shot close in a design store | ✅ the design / the Eameses | design-curious subject, specific |
| Mural photographed straight-on | ✅ if attributable to an artist; ❌ generic graffiti | specificity decides |

## Worthiness score (the choosier-topics layer)

Extraction proposes candidates; a separate judge (Claude Haiku, see
`server/src/integrations/anthropic.ts`) scores each 0–100 before anything is
written. Four dimensions, 25 points each: **attention** (how hard the photos
voted), **specificity** (named subject vs. category), **depth** (a real story
to research), **teachability** (will the reader actually learn something).

| Score | Tier | Examples | Treatment |
| --- | --- | --- | --- |
| 80–100 | 1 — front page | the pyebaek and its ducks · Honeysuckle · Baby Keem at Brooklyn Paramount · Arthur Jafa | written |
| 65–79 | 2 | the Paramount building itself · a named ice-cream shop · the artist behind a mural | written |
| 50–64 | 3 | a neighborhood's history · a dish style · an Eames chair | written (threshold = `ARTICLE_SCORE_MIN`, default 50) |
| 35–49 | 4 | borderline ambient subjects | shelved |
| 0–34 | 5 — skip | NASA mug · MacBook · sourdough toast · skylines | shelved |

The reader rates every article 1–5 in the app (1 = best); ratings feed back
into the judge as liked/disliked exemplars, so the boundary converges on THIS
reader's front page. Scores + per-dimension breakdowns are stored on
`discover_topics.score_reasons` for auditing bad calls.

## Scorecard

The extraction prompt embeds this canon; `scripts` runs scenario batteries
against the live model. Last run: see commit message / test output. Iterate by
adding misses to the canon above and re-running.
