# Webflow Cleanup Assistant

Manifest V3 Chrome extension that audits the **currently open tab** (typically a **published** Webflow page) and shows a **handoff-oriented cleanup report** in the popup: weighted score, **score label**, **handoff verdict**, **complexity badge**, **“Why this score?”** penalty breakdown, severity counts, issues (sorted by severity), **client-friendly Markdown**, and optional full **JSON** export.

No backend, no React, no AI — plain HTML, CSS, and vanilla JavaScript.

## What “handoff readiness” means

This tool estimates whether the **published page’s DOM and styling habits** look disciplined enough to **hand off to a client or stakeholder** without obvious structural debt:

- **Naming & reuse** — Fewer default Webflow-style classes, leaner combo stacks, less class noise (developer-authored classes only).
- **Structure & semantics** — Reasonable nesting in layout markup, meaningful sections/headings, baseline semantics.
- **Accessibility & spacing** — Obvious image/link/control issues are surfaced; spacing chaos is flagged.

It does **not** replace QA, design review, or WCAG audits; it’s a **quick technical pre-flight** before client review.

## Context-aware scoring — what is and isn’t counted

The audit is intentionally **context-aware** so that complex but well-built Webflow sites are not unfairly penalised. Before any scoring runs, the audit classifies markup into two groups:

### Counted (real developer-impacting signals)

- Default Webflow class names that have **not** been renamed: `div-block`, `div-block-2`, `text-block`, `image-3`, `heading-2`, `link-block-2`, `button`, `section`, `container`, `paragraph`, `bold-text`, `list`, `list-item`, `form-block`, `grid` (with optional numeric suffix).
- **Developer combo class stacks** (count only classes _not_ from libraries or Webflow runtime): 4–5 → warning, 6+ → critical.
- **Developer-class duplication signals**: very long class names (>40 chars), classes with `\d{2,}$` numeric suffixes, large numbers of one-off classes.
- **Layout-level structural problems**: deep nesting **outside** SVG/slider subtrees, empty `div`/`section`, long generic `div` chains.
- **Semantics**: missing/multiple `main`, missing/multiple `h1`, skipped heading levels, clickable-looking `div`s (excluding Webflow widgets like `w-nav`, `w-slider`, `w-tabs`, `w-dropdown`, `w-lightbox`).
- **Accessibility basics**: visible `img` without `alt`, `a[href]` with empty/`#` href or no accessible name, `button` with no accessible name, inputs/textareas/selects without a label.
- **Spacing consistency**: count of distinct non-zero vertical spacing values.

### Ignored (technical noise, classified but not penalised)

Filtering happens through a centralised `AUDIT_IGNORE_CONFIG` in `content.js`:

| Group | Examples |
| ----- | -------- |
| `ignoredTags` | `SCRIPT`, `STYLE`, `NOSCRIPT`, `META`, `LINK`, `TEMPLATE`, **SVG subtree** (`SVG`, `PATH`, `G`, `DEFS`, `CLIPPATH`, `MASK`, `USE`, `SYMBOL`, `RECT`, `CIRCLE`, `ELLIPSE`, `LINE`, `POLYLINE`, `POLYGON`, `TEXT`, `TSPAN`, `FILTER`, `LINEARGRADIENT`, `RADIALGRADIENT`, `STOP`, `PATTERN`, `MARKER`, `FOREIGNOBJECT`) |
| `ignoredClassPrefixes` | `swiper`, `slick`, `splide`, `flickity`, `glide`, `tns`, `aos`, `gsap`, `lightbox`, `fancybox`, `lenis`, `rellax`, `lottie`, `w-`, `w--`, `wf-` |
| `ignoredClassNames` | Full names from Swiper / Splide / Slick / Flickity / Glide, **and** Webflow runtime classes such as `w-nav`, `w-nav-menu`, `w-slider`, `w-slider-mask`, `w-slide`, `w-dyn-list`, `w-dyn-item`, `w-condition-invisible`, `w-dropdown`, `w-tabs`, `w-richtext`, `w-form`, `w-layout-grid`, `w--current`, etc. |
| `sliderRootSelectors` | `.swiper`, `.swiper-container`, `.splide`, `.slick-slider`, `.flickity-enabled`, `.glide`, `.tns-outer`, `.w-slider`, `.w-slider-mask`, `[data-swiper]`, `[data-glide-el]` |

Helpers exposed in `content.js`:

- `isIgnoredElement(el)` — element tag is in `ignoredTags` (SVG markup, `SCRIPT`, etc.).
- `isInsideIgnoredContext(el)` — any ancestor is in `ignoredTags` (so SVG descendants are filtered everywhere).
- `isThirdPartyClass(className)` — class starts with a known library prefix (`swiper-…`, `splide__…`, `slick-…`, etc.).
- `isWebflowRuntimeClass(className)` — class starts with `w-`, `w--`, or `wf-`.
- `getDeveloperClasses(element)` — returns the element’s classes with all third-party and runtime classes removed.

### How the rules apply

- **Class naming audit** flags only default-pattern names on **developer-authored** classes. `w-nav`, `w-slider`, `w-dyn-item`, `swiper-slide`, `splide__slide`, etc. are never reported as bad naming.
- **Combo class audit** counts only developer classes: e.g. `class="swiper-slide w-dyn-item card is-active"` → **2** developer classes (`card`, `is-active`), not 4.
- **Class messiness audit** runs against developer classes only, so library-generated class noise never inflates one-off / long-name / numeric-suffix counts.
- **Structure audit** ignores SVG subtrees completely. Deep nesting **inside** a slider container is shown as a warning at most (never auto-critical), and example reasons explicitly state the context, e.g. _“Layout element div nested 13 levels deep — class=…”_ vs. _“div depth 13 (inside slider) class=… — slider widget internals”_.
- **Semantic audit** skips Webflow widgets (`.w-nav`, `.w-dropdown`, `.w-tabs`, `.w-lightbox`) and slider roots when scanning for “clickable-looking divs”, so a click-handled `.w-slide` is not a false positive.

## Complexity (reported separately from quality)

Complexity is reported alongside the score but **does not directly reduce the cleanup score**. It is meant to give context — a CMS-heavy page with multiple sliders is allowed to score very well if the developer-authored markup is tidy.

`complexity: { level: "low" | "medium" | "high", signals: [], metrics: {…} }`

Signals can include:

- `${n} DOM nodes`
- `${n} sliders / carousels`
- `${n} CMS items`
- `${n} interaction targets` (`[data-w-id]`, `[data-w-tab]`, `[data-w-anim]`, `[data-ix]`)
- `${n} SVGs`
- `${n} unique developer classes`

Penalty rule (intentionally conservative):

> A complexity-driven penalty is added **only if** complexity is `high` **and** the page has at least 2 real warning/critical issues. It is capped at **−5**. A perfectly clean, very complex page receives **no** complexity penalty.

The badge in the popup shows the level (`Low`, `Medium`, `High`) plus the first few signals.

## Scoring logic (weighted)

The numeric score starts at **100**. Each audit **issue** contributes a raw penalty:

`severityWeight × categoryMultiplier × intensityMultiplier`

**Severity weights**

| Severity | Weight |
| -------- | ------ |
| critical | 8      |
| warning  | 4      |
| info     | 1      |

**Category multipliers**

| Bucket        | Multiplier |
| ------------- | ---------- |
| accessibility | 1.4        |
| semantic      | 1.2        |
| structure     | 1.1        |
| classNaming   | 1.0        |
| comboClasses  | 1.0        |
| spacing       | 0.8        |
| duplicates    | 0.8        |

**Intensity** (from `affectedElementsCount` or example count when count is missing)

| Affected / examples | Multiplier |
| ------------------- | ---------- |
| 1                   | 1.0        |
| 2–5                 | 1.25       |
| 6–15                | 1.5        |
| 16+                 | 2.0        |

Penalties are summed **per bucket**, then each bucket total is **capped**:

| Bucket        | Max penalty |
| ------------- | ----------- |
| accessibility | 25          |
| semantic      | 20          |
| structure     | 20          |
| classNaming   | 20          |
| comboClasses  | 15          |
| spacing       | 10          |
| duplicates    | 10          |

The score is `100 − sum(capped bucket penalties) − complexityPenalty`, clamped to **0–100**, then **critical caps** apply.

### Critical caps (only for real developer-impacting criticals)

Critical caps only apply when a critical issue is in this allow-list of titles:

- `Missing h1 heading`
- `Multiple h1 headings`
- `Accessibility basics need attention`
- `Default Webflow-style class names detected`
- `Heavy developer combo class stacks (6+)`
- `Very deep DOM nesting in layout`

The cap then behaves as:

- At least **1** eligible critical → score cannot exceed **79**
- **3+** eligible criticals → cannot exceed **69**
- **5+** eligible criticals → cannot exceed **59**

With this filtering, SVG nesting, Swiper classes, Webflow runtime classes, or third-party slider classes can **never** cap the score on their own.

### Score label (quality band)

| Score   | Label              |
| ------- | ------------------ |
| 90–100  | Clean              |
| 75–89   | Mostly clean       |
| 60–74   | Needs cleanup      |
| 40–59   | Messy              |
| 0–39    | Not handoff-ready  |

### Handoff verdict

| Score   | Verdict                                |
| ------- | -------------------------------------- |
| 85–100  | Ready for handoff                      |
| 65–84   | Needs light cleanup before handoff     |
| 50–64   | Needs cleanup                          |
| 0–49    | Not ready yet                          |

### Bar / accent colors (popup)

The score ring and bar use **Lighthouse-style** color bands on the **numeric** score: **90+** green, **50–89** orange, **0–49** red (`--score-green`, `--score-orange`, `--score-red` in CSS).

## Ignored findings summary

Each audit result now includes:

```js
ignoredFindings: {
  thirdPartyClasses: number,   // Swiper/Slick/Splide/… class usages
  webflowRuntimeClasses: number, // w-*, wf-* class usages
  svgElementsIgnored: number,  // tags inside the SVG subtree
  sliderElementsIgnored: number, // elements carrying slider-recognised classes
}
```

Surfaced in the popup as a small muted note such as:

> Technical noise ignored: 36 third-party / library classes, 22 Webflow runtime classes, 14 SVG elements.

…and as a dedicated section inside the **“Why this score?”** drawer (alongside the actual penalties).

## Load the unpacked extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `webflow-cleanup-assistant` folder (the one that contains `manifest.json`).

## Test on a published Webflow site

1. Publish a Webflow project or open any live site (`*.webflow.io` or your custom domain).
2. Click the **Webflow Cleanup Assistant** icon.
3. Read the short intro, then click **Analyze page**.
4. Open the browser **console** for the popup (right‑click the popup → Inspect) to see `[Webflow Cleanup Assistant] analysis debug` (totals, severities, breakdown, final score, `complexity`, `ignoredFindings`).
5. Expand **Why this score?** to see per-category penalties (with short reasons) **and** the list of ignored technical noise.
6. Optional exports:
   - **Copy client-friendly report** — Markdown with score, **Status**, **Verdict**, **Complexity**, counts, ignored noise, top issues, recommended fixes.
   - **Copy report JSON** — Full payload including `scoreBreakdown`, `complexity`, `ignoredFindings`.

**Note:** Restricted URLs (`chrome://`, Chrome Web Store, `edge://`, etc.) cannot be scripted. Use a normal `http(s)` page.

## Checks included

1. **Class naming** — Default Webflow-style names among developer classes; messy-class signals (one-offs, long names, numeric suffixes).
2. **Combo classes** — Warning at 4+ developer classes per element, critical at 6+.
3. **Duplicate / messy classes** — Unique count of developer classes, one-offs, long/suspicious names.
4. **Structure** — Layout depth (ignoring SVG subtree, demoting slider-internal nesting from critical to warning), empty divs/sections, generic div chains.
5. **Semantic HTML** — Div vs semantic usage, `main`/`h1`, heading outline sample, skipped levels, clickable-looking divs (excluding Webflow widgets).
6. **Accessibility basics** — Images `alt`, link/button names, labels, bad `href` (sample-based).
7. **Spacing consistency** — Unique non-zero vertical spacing values via `getComputedStyle`.

## Permissions

- **`activeTab`** — Temporary access when you use the extension (e.g. analyze from the popup).
- **`scripting`** — Inject `content.js` on demand.

## Why complexity is separate from quality

A site can be _well-built_ and _technically complex_ at the same time. A site with 3 Swiper sliders, 60 CMS items, 25 SVG icons, and 40 Webflow interactions still has a small developer-authored surface: maybe a hundred semantic class names, a few hero/feature/CTA sections, a clean nav and footer. We measure quality on **that** surface — not on the library output. Complexity is shown as a separate badge so it informs the verdict without dragging the score down.

## Known limitations

- **Prefix heuristics**: any class that happens to start with `w-`, `wf-`, or a library prefix is treated as runtime/library. A handwritten class like `w-flex` would be treated as a Webflow runtime class. Prefer namespaced developer classes (e.g. `app-flex`).
- **Sliders not in the ignore list**: brand-new carousel libraries we have not catalogued in `AUDIT_IGNORE_CONFIG` will currently be counted as developer markup. Add their root selector / class prefix to the config to teach the audit.
- **Static DOM only**: the audit is a single DOM snapshot. Lazy-loaded content (modals, off-screen tabs) is missed.
- **Visibility-based filters**: image/link/control accessibility checks only run on currently visible nodes (computed style + bounding rect), so hidden states are not inspected.
- **Spacing scale**: derived from computed styles, so utility-class systems that vary spacing per breakpoint will look noisier than they really are at one viewport.
- **Single-page scope**: only the active tab is analysed; multi-page audits are not yet supported.

## Future improvements

- **AI-generated summary** — Prioritized narrative from audit results.
- **Markdown export** — Save/download Markdown or richer exports (beyond clipboard).
- **Page comparison** — Diff scores and issues across URLs or snapshots.
- **Webflow Designer support** — Audit constraints inside the Designer preview/canvas.
- **Saved audit history** — Local history of runs per project or URL.
- **Configurable ignore list** — Surface `AUDIT_IGNORE_CONFIG` in the popup so teams can add their own runtime/library prefixes.

## Project layout

```
webflow-cleanup-assistant/
  manifest.json
  popup.html
  popup.css
  popup.js
  content.js
  README.md
```
