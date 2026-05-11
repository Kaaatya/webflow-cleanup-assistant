/**
 * Webflow Cleanup Assistant — page analyzer (runs in the extension isolated world).
 * Exposes: analyzeWebflowPage()
 *
 * Scoring is intentionally context-aware:
 *   - Third-party library noise (Swiper, Slick, Splide, …) is excluded.
 *   - Webflow runtime/system classes (w-*, wf-*) are excluded from "developer class" checks.
 *   - SVG markup is excluded from class/structure audits (it's authored as a single asset).
 *   - Sliders are recognised as ignored contexts for deep-nesting checks.
 *   - Complexity (large DOM, many sliders/CMS items, many SVGs) is reported separately
 *     and does NOT directly lower the cleanup score.
 */

(function webflowCleanupAssistantContent() {
  const AUDIT_IGNORE_CONFIG = {
    ignoredTags: [
      "SCRIPT",
      "STYLE",
      "NOSCRIPT",
      "META",
      "LINK",
      "TEMPLATE",
      "SVG",
      "PATH",
      "G",
      "DEFS",
      "CLIPPATH",
      "MASK",
      "USE",
      "SYMBOL",
      "RECT",
      "CIRCLE",
      "ELLIPSE",
      "LINE",
      "POLYLINE",
      "POLYGON",
      "TEXT",
      "TSPAN",
      "FILTER",
      "LINEARGRADIENT",
      "RADIALGRADIENT",
      "STOP",
      "PATTERN",
      "MARKER",
      "FOREIGNOBJECT",
    ],
    ignoredClassPrefixes: [
      "swiper",
      "slick",
      "splide",
      "flickity",
      "glide",
      "tns",
      "aos",
      "gsap",
      "lightbox",
      "fancybox",
      "lenis",
      "rellax",
      "lottie",
      "w-",
      "w--",
      "wf-",
    ],
    ignoredClassNames: [
      "swiper",
      "swiper-wrapper",
      "swiper-slide",
      "swiper-initialized",
      "swiper-horizontal",
      "swiper-vertical",
      "swiper-backface-hidden",
      "swiper-button-next",
      "swiper-button-prev",
      "swiper-pagination",
      "swiper-pagination-bullet",
      "swiper-pagination-bullet-active",
      "swiper-scrollbar",
      "swiper-lazy",
      "swiper-slide-active",
      "swiper-slide-next",
      "swiper-slide-prev",
      "swiper-slide-visible",
      "swiper-no-swiping",
      "splide__slide",
      "splide__list",
      "splide__track",
      "splide__pagination",
      "slick-slide",
      "slick-track",
      "slick-list",
      "slick-arrow",
      "slick-dots",
      "flickity-enabled",
      "flickity-viewport",
      "flickity-slider",
      "glide__slide",
      "glide__track",
      "glide__slides",
      "w-dyn-item",
      "w-dyn-items",
      "w-dyn-list",
      "w-dyn-empty",
      "w-dyn-hide",
      "w-dyn-bind-empty",
      "w-condition-invisible",
      "w-slider",
      "w-slider-mask",
      "w-slider-nav",
      "w-slider-arrow-left",
      "w-slider-arrow-right",
      "w-slider-dot",
      "w-slide",
      "w-nav",
      "w-nav-menu",
      "w-nav-link",
      "w-nav-brand",
      "w-nav-button",
      "w-nav-overlay",
      "w-dropdown",
      "w-dropdown-toggle",
      "w-dropdown-list",
      "w-dropdown-link",
      "w-tabs",
      "w-tab-menu",
      "w-tab-link",
      "w-tab-content",
      "w-tab-pane",
      "w-lightbox",
      "w-richtext",
      "w-form",
      "w-form-fail",
      "w-form-done",
      "w-checkbox",
      "w-checkbox-input",
      "w-radio",
      "w-radio-input",
      "w-button",
      "w-inline-block",
      "w-embed",
      "w-clearfix",
      "w-container",
      "w-row",
      "w-col",
      "w-layout-grid",
      "w-layout-blockcontainer",
      "w-layout-hflex",
      "w-layout-vflex",
      "w-background-video",
      "w-pagination-wrapper",
      "w-pagination-previous",
      "w-pagination-next",
      "w--current",
      "w--open",
    ],
    sliderRootSelectors: [
      ".swiper",
      ".swiper-container",
      ".splide",
      ".slick-slider",
      ".flickity-enabled",
      ".glide",
      ".tns-outer",
      ".w-slider",
      ".w-slider-mask",
      "[data-swiper]",
      "[data-glide-el]",
    ],
  };

  const IGNORED_TAGS_SET = new Set(
    AUDIT_IGNORE_CONFIG.ignoredTags.map((t) => t.toUpperCase()),
  );

  function elementTag(el) {
    if (!el || !el.tagName) return "";
    return String(el.tagName).toUpperCase();
  }
  const IGNORED_CLASS_NAMES_SET = new Set(
    AUDIT_IGNORE_CONFIG.ignoredClassNames.map((c) => c.toLowerCase()),
  );
  const IGNORED_CLASS_PREFIXES = AUDIT_IGNORE_CONFIG.ignoredClassPrefixes.map(
    (p) => p.toLowerCase(),
  );
  const SLIDER_ROOT_SELECTOR = AUDIT_IGNORE_CONFIG.sliderRootSelectors.join(",");

  const SEMANTIC_TAGS = new Set([
    "ARTICLE",
    "ASIDE",
    "FOOTER",
    "HEADER",
    "MAIN",
    "NAV",
    "SECTION",
    "FIGURE",
    "FIGCAPTION",
    "ADDRESS",
    "HGROUP",
  ]);

  const MEANINGFUL_MEDIA_SELECTORS =
    "img, picture, video, svg, canvas, iframe, input, button, a, textarea, select";

  // Default Webflow auto-generated class patterns we still want to flag as
  // "needs renaming". These intentionally do NOT cover w-* runtime classes.
  const DEFAULT_CLASS_REGEXES = [
    /^div-block(-\d+)?$/,
    /^text-block(-\d+)?$/,
    /^image(-\d+)?$/,
    /^heading(-\d+)?$/,
    /^link-block(-\d+)?$/,
    /^button(-\d+)?$/,
    /^section(-\d+)?$/,
    /^container(-\d+)?$/,
    /^paragraph(-\d+)?$/,
    /^bold-text(-\d+)?$/,
    /^list(-\d+)?$/,
    /^list-item(-\d+)?$/,
    /^form-block(-\d+)?$/,
    /^grid(-\d+)?$/,
  ];

  function isIgnoredElement(el) {
    return !!(el && el.tagName && IGNORED_TAGS_SET.has(elementTag(el)));
  }

  function classNameToString(el) {
    if (!el) return "";
    const cn = el.className;
    if (typeof cn === "string") return cn;
    if (cn && typeof cn.baseVal === "string") return cn.baseVal;
    return "";
  }

  function getClassListArray(el) {
    if (!el) return [];
    if (el.classList && el.classList.length) {
      return Array.from(el.classList);
    }
    const s = classNameToString(el).trim();
    if (!s) return [];
    return s.split(/\s+/).filter(Boolean);
  }

  function isThirdPartyClass(className) {
    if (!className) return false;
    const lower = String(className).toLowerCase();
    if (IGNORED_CLASS_NAMES_SET.has(lower)) {
      if (!isWebflowRuntimeClass(lower)) return true;
    }
    for (let i = 0; i < IGNORED_CLASS_PREFIXES.length; i++) {
      const p = IGNORED_CLASS_PREFIXES[i];
      if (p === "w-" || p === "w--" || p === "wf-") continue;
      if (lower === p || lower.startsWith(p + "-") || lower.startsWith(p + "_")) {
        return true;
      }
    }
    return false;
  }

  function isWebflowRuntimeClass(className) {
    if (!className) return false;
    const lower = String(className).toLowerCase();
    if (lower === "w" || lower === "wf") return true;
    if (
      lower.startsWith("w-") ||
      lower.startsWith("w--") ||
      lower.startsWith("wf-")
    ) {
      return true;
    }
    return false;
  }

  function isIgnoredClassName(className) {
    if (!className) return false;
    if (isWebflowRuntimeClass(className)) return true;
    if (isThirdPartyClass(className)) return true;
    return false;
  }

  function getDeveloperClasses(el) {
    const out = [];
    const list = getClassListArray(el);
    for (let i = 0; i < list.length; i++) {
      if (!isIgnoredClassName(list[i])) out.push(list[i]);
    }
    return out;
  }

  function getDeveloperClassString(el) {
    return getDeveloperClasses(el).join(" ");
  }

  function isInsideSvg(el) {
    if (!el || !el.parentElement) return false;
    let n = el.parentElement;
    while (n) {
      if (elementTag(n) === "SVG") return true;
      n = n.parentElement;
    }
    return false;
  }

  function isInsideSliderRoot(el) {
    if (!el || !el.closest) return false;
    try {
      const hit = el.closest(SLIDER_ROOT_SELECTOR);
      return !!(hit && hit !== el);
    } catch (e) {
      return false;
    }
  }

  // True when an element should be skipped for ALL structure/class audits
  // (SVG subtree, scripts, styles, embeds-only nodes, etc.).
  function isInsideIgnoredContext(el) {
    if (!el || !el.parentElement) return false;
    let n = el.parentElement;
    while (n) {
      if (IGNORED_TAGS_SET.has(elementTag(n))) return true;
      n = n.parentElement;
    }
    return false;
  }

  function shouldSkipForAudit(el) {
    if (!el) return true;
    if (isIgnoredElement(el)) return true;
    if (isInsideIgnoredContext(el)) return true;
    return false;
  }

  function isDefaultWebflowClassName(name) {
    if (!name) return false;
    if (isIgnoredClassName(name)) return false;
    return DEFAULT_CLASS_REGEXES.some((re) => re.test(name));
  }

  function isVisibleElement(el) {
    if (!(el instanceof HTMLElement)) return false;
    const cs = getComputedStyle(el);
    if (
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      Number(cs.opacity) === 0
    ) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getDepth(el, root) {
    let d = 0;
    let n = el;
    while (n && n !== root && n.parentElement) {
      d += 1;
      n = n.parentElement;
    }
    return d;
  }

  function hasMeaningfulContent(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      let p = node.parentElement;
      let skipText = false;
      while (p && p !== el) {
        if (p.tagName === "SCRIPT" || p.tagName === "STYLE") {
          skipText = true;
          break;
        }
        p = p.parentElement;
      }
      if (skipText) continue;
      if (node.textContent && node.textContent.trim()) return true;
    }
    return !!el.querySelector(MEANINGFUL_MEDIA_SELECTORS);
  }

  function isEmptyStructural(el, tagNameUpper) {
    if (el.tagName !== tagNameUpper) return false;
    return !hasMeaningfulContent(el);
  }

  function parsePx(value) {
    if (!value || value === "auto") return 0;
    const m = String(value).match(/^([\d.]+)px$/);
    return m ? parseFloat(m[1]) : 0;
  }

  function findLabelForId(id) {
    if (!id || !document.body) return null;
    const labels = document.body.getElementsByTagName("label");
    for (let i = 0; i < labels.length; i++) {
      if (labels[i].htmlFor === id) return labels[i];
    }
    return null;
  }

  function getAccessibleName(el) {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/).filter(Boolean);
      const parts = ids
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => n.textContent.trim())
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    const al = el.getAttribute("aria-label");
    if (al && al.trim()) return al.trim();
    const t = el.textContent ? el.textContent.trim() : "";
    if (t) return t;
    const img = el.querySelector("img[alt]");
    if (img && img.getAttribute("alt")) return img.getAttribute("alt").trim();
    return "";
  }

  function truncate(s, max) {
    if (!s) return "";
    const str = String(s);
    return str.length > max ? `${str.slice(0, max)}…` : str;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Ignored-findings tracker (collected up-front in one sweep)
  // ────────────────────────────────────────────────────────────────────────

  function collectIgnoredFindings(root) {
    const findings = {
      thirdPartyClasses: 0,
      webflowRuntimeClasses: 0,
      svgElementsIgnored: 0,
      sliderElementsIgnored: 0,
    };
    if (!root) return findings;

    const SVG_TAG_SET = new Set([
      "SVG",
      "PATH",
      "G",
      "DEFS",
      "CLIPPATH",
      "MASK",
      "USE",
      "SYMBOL",
      "RECT",
      "CIRCLE",
      "ELLIPSE",
      "LINE",
      "POLYLINE",
      "POLYGON",
      "TEXT",
      "TSPAN",
      "FILTER",
      "LINEARGRADIENT",
      "RADIALGRADIENT",
      "STOP",
      "PATTERN",
      "MARKER",
      "FOREIGNOBJECT",
    ]);

    const all = root.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const tag = elementTag(el);
      if (IGNORED_TAGS_SET.has(tag) && SVG_TAG_SET.has(tag)) {
        findings.svgElementsIgnored += 1;
      }

      const list = getClassListArray(el);
      let elementIsSlider = false;
      for (let j = 0; j < list.length; j++) {
        const c = list[j];
        if (isThirdPartyClass(c)) {
          findings.thirdPartyClasses += 1;
          const lc = c.toLowerCase();
          if (
            lc.startsWith("swiper") ||
            lc.startsWith("splide") ||
            lc.startsWith("slick") ||
            lc.startsWith("flickity") ||
            lc.startsWith("glide") ||
            lc.startsWith("tns")
          ) {
            elementIsSlider = true;
          }
        } else if (isWebflowRuntimeClass(c)) {
          findings.webflowRuntimeClasses += 1;
          const lc = c.toLowerCase();
          if (lc === "w-slider" || lc === "w-slider-mask" || lc === "w-slide") {
            elementIsSlider = true;
          }
        }
      }
      if (elementIsSlider) findings.sliderElementsIgnored += 1;
    }
    return findings;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Class audits (developer classes only)
  // ────────────────────────────────────────────────────────────────────────

  function auditDefaultClasses() {
    const classCounts = Object.create(null);
    let elementsWithAny = 0;
    let totalMatches = 0;

    const all = document.body ? document.body.getElementsByTagName("*") : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (shouldSkipForAudit(el)) continue;
      const devClasses = getDeveloperClasses(el);
      if (!devClasses.length) continue;
      let hitOnEl = 0;
      for (let j = 0; j < devClasses.length; j++) {
        const c = devClasses[j];
        if (isDefaultWebflowClassName(c)) {
          classCounts[c] = (classCounts[c] || 0) + 1;
          hitOnEl += 1;
          totalMatches += 1;
        }
      }
      if (hitOnEl) elementsWithAny += 1;
    }

    const sorted = Object.entries(classCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      totalMatches,
      affectedElements: elementsWithAny,
      topClasses: sorted.map(([name, count]) => ({ name, count })),
    };
  }

  function auditComboClasses() {
    const warningEls = [];
    const issueEls = [];

    const all = document.body ? document.body.getElementsByTagName("*") : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (shouldSkipForAudit(el)) continue;
      const dev = getDeveloperClasses(el);
      const n = dev.length;
      if (n >= 6) {
        issueEls.push({ el, dev });
      } else if (n >= 4) {
        warningEls.push({ el, dev });
      }
    }

    const examples = [];
    for (let i = 0; i < issueEls.length && examples.length < 6; i++) {
      const { el, dev } = issueEls[i];
      examples.push({
        tagName: el.tagName.toLowerCase(),
        className: dev.join(" "),
        count: dev.length,
        level: "issue",
      });
    }
    for (let i = 0; i < warningEls.length && examples.length < 10; i++) {
      const { el, dev } = warningEls[i];
      examples.push({
        tagName: el.tagName.toLowerCase(),
        className: dev.join(" "),
        count: dev.length,
        level: "warning",
      });
    }

    return {
      warningCount: warningEls.length,
      issueCount: issueEls.length,
      affectedCount:
        new Set([...issueEls.map((x) => x.el), ...warningEls.map((x) => x.el)])
          .size,
      examples,
    };
  }

  function auditClassMessiness() {
    const freq = Object.create(null);
    const all = document.body ? document.body.getElementsByTagName("*") : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (shouldSkipForAudit(el)) continue;
      const dev = getDeveloperClasses(el);
      if (!dev.length) continue;
      for (let j = 0; j < dev.length; j++) {
        const c = dev[j];
        freq[c] = (freq[c] || 0) + 1;
      }
    }

    const unique = Object.keys(freq).length;
    const oneOffs = Object.entries(freq).filter(([, n]) => n === 1);
    const longNames = Object.keys(freq).filter((c) => c.length > 40);
    const suspicious = Object.keys(freq).filter((c) => /\d{2,}$/.test(c));

    return {
      uniqueClassNames: unique,
      oneOffCount: oneOffs.length,
      longClassNames: longNames.slice(0, 15),
      suspiciousClassNames: suspicious.slice(0, 15),
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Structure audit (ignores SVG subtree, de-prioritises slider internals)
  // ────────────────────────────────────────────────────────────────────────

  function auditStructure() {
    let maxDepth = 0;
    let layoutMaxDepth = 0;
    const deepWarningSamples = [];
    const deepIssueSamples = [];
    let genericDivNestMax = 0;

    const root = document.body;
    if (!root) {
      return {
        maxDepth: 0,
        layoutMaxDepth: 0,
        emptyDivCount: 0,
        emptySectionCount: 0,
        deepWarningExamples: [],
        deepIssueExamples: [],
        genericDivNestMax: 0,
        emptyDivExamples: [],
        emptySectionExamples: [],
      };
    }

    const all = root.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (shouldSkipForAudit(el)) continue;
      if (isInsideSvg(el)) continue;

      const depth = getDepth(el, root);
      if (depth > maxDepth) maxDepth = depth;

      const insideSlider = isInsideSliderRoot(el);
      const devClassStr = truncate(getDeveloperClassString(el), 80);

      if (!insideSlider && depth > layoutMaxDepth) {
        layoutMaxDepth = depth;
      }

      if (depth > 12) {
        if (insideSlider) {
          if (deepWarningSamples.length < 5) {
            deepWarningSamples.push(
              `${el.tagName.toLowerCase()} depth ${depth} (inside slider) class="${devClassStr}" — slider widget internals`,
            );
          }
        } else {
          if (deepIssueSamples.length < 5) {
            deepIssueSamples.push(
              `Layout element ${el.tagName.toLowerCase()} nested ${depth} levels deep — class="${devClassStr}"`,
            );
          }
        }
      } else if (depth > 8) {
        if (deepWarningSamples.length < 5) {
          const reason = insideSlider
            ? "inside slider widget"
            : "layout wrapper";
          deepWarningSamples.push(
            `${el.tagName.toLowerCase()} depth ${depth} (${reason}) class="${devClassStr}"`,
          );
        }
      }
    }

    const emptyDivs = [];
    const emptySections = [];
    let emptyDivCount = 0;
    let emptySectionCount = 0;
    const divs = root.getElementsByTagName("div");
    for (let i = 0; i < divs.length; i++) {
      const el = divs[i];
      if (shouldSkipForAudit(el)) continue;
      if (isInsideSvg(el)) continue;
      if (isEmptyStructural(el, "DIV")) {
        emptyDivCount += 1;
        if (emptyDivs.length < 8) {
          emptyDivs.push(
            `div class="${truncate(getDeveloperClassString(el) || classNameToString(el), 100)}"`,
          );
        }
      }
    }
    const sections = root.getElementsByTagName("section");
    for (let i = 0; i < sections.length; i++) {
      const el = sections[i];
      if (shouldSkipForAudit(el)) continue;
      if (isEmptyStructural(el, "SECTION")) {
        emptySectionCount += 1;
        if (emptySections.length < 8) {
          emptySections.push(
            `section class="${truncate(getDeveloperClassString(el) || classNameToString(el), 100)}"`,
          );
        }
      }
    }

    const divsAll = root.getElementsByTagName("div");
    for (let i = 0; i < divsAll.length; i++) {
      const startEl = divsAll[i];
      if (shouldSkipForAudit(startEl)) continue;
      if (isInsideSvg(startEl)) continue;
      let chain = 0;
      let n = startEl;
      while (n && n.tagName === "DIV") {
        chain += 1;
        n = n.parentElement;
      }
      if (chain > genericDivNestMax) genericDivNestMax = chain;
    }

    return {
      maxDepth,
      layoutMaxDepth,
      emptyDivCount,
      emptySectionCount,
      deepWarningExamples: deepWarningSamples,
      deepIssueExamples: deepIssueSamples,
      genericDivNestMax,
      emptyDivExamples: emptyDivs,
      emptySectionExamples: emptySections,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Semantic + accessibility + spacing (largely unchanged, but skips ignored)
  // ────────────────────────────────────────────────────────────────────────

  function auditSemantics() {
    let divCount = 0;
    let semanticCount = 0;

    const all = document.body ? document.body.getElementsByTagName("*") : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (shouldSkipForAudit(el)) continue;
      if (el.tagName === "DIV") divCount += 1;
      if (SEMANTIC_TAGS.has(el.tagName)) semanticCount += 1;
    }

    const mains = document.body ? document.body.querySelectorAll("main") : [];
    const h1s = document.body ? document.body.querySelectorAll("h1") : [];

    const headings = [];
    const outline = [];
    if (document.body) {
      const hs = document.body.querySelectorAll("h1, h2, h3, h4, h5, h6");
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i];
        if (shouldSkipForAudit(h)) continue;
        const level = parseInt(h.tagName[1], 10);
        headings.push({ level, text: truncate(h.textContent.trim(), 80) });
        outline.push(`h${level}: ${truncate(h.textContent.trim(), 60)}`);
      }
    }

    const skippedLevels = [];
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1].level;
      const cur = headings[i].level;
      if (cur - prev > 1) {
        skippedLevels.push(`After h${prev} → h${cur}`);
      }
    }

    const clickableDivExamples = [];
    const divNodes = document.body
      ? document.body.getElementsByTagName("div")
      : [];
    for (let i = 0; i < divNodes.length && clickableDivExamples.length < 8; i++) {
      const el = divNodes[i];
      if (shouldSkipForAudit(el)) continue;
      const role = el.getAttribute("role");
      if (role === "button" || role === "link") continue;
      const hasClick = el.hasAttribute("onclick");
      const tab = el.getAttribute("tabindex");
      const tabNum = tab !== null ? parseInt(tab, 10) : null;
      const cs = getComputedStyle(el);
      const cursorPointer = cs.cursor === "pointer";
      const looksClickable =
        hasClick ||
        (tabNum !== null && !Number.isNaN(tabNum) && tabNum >= 0) ||
        cursorPointer;
      if (!looksClickable) continue;
      // Inside Webflow widgets (slider, nav, dropdown), cursor:pointer is
      // expected — skip those to avoid false positives.
      if (isInsideSliderRoot(el)) continue;
      if (el.closest(".w-nav, .w-dropdown, .w-tabs, .w-lightbox")) continue;
      clickableDivExamples.push(
        `div class="${truncate(getDeveloperClassString(el) || classNameToString(el), 90)}" tabindex="${tab || ""}"`,
      );
    }

    return {
      divCount,
      semanticCount,
      mainCount: mains.length,
      h1Count: h1s.length,
      headingOutline: outline.slice(0, 25),
      skippedHeadingSignals: skippedLevels.slice(0, 10),
      clickableDivExamples,
    };
  }

  function auditAccessibility() {
    const issues = [];

    const imgs = document.body ? document.body.querySelectorAll("img") : [];
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      if (shouldSkipForAudit(img)) continue;
      if (!isVisibleElement(img)) continue;
      const alt = img.getAttribute("alt");
      if (alt === null || alt === "") {
        issues.push({
          type: "img-alt",
          text: `img src="${truncate(img.currentSrc || img.src || "", 60)}"`,
        });
      }
    }

    const links = document.body
      ? document.body.querySelectorAll("a[href]")
      : [];
    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      if (shouldSkipForAudit(a)) continue;
      const href = a.getAttribute("href") || "";
      if (href === "#" || href === "" || href.trim() === "") {
        issues.push({
          type: "link-href",
          text: `a href="${truncate(href, 40)}" class="${truncate(
            getDeveloperClassString(a) || classNameToString(a),
            60,
          )}"`,
        });
      }
      if (!isVisibleElement(a)) continue;
      const name = getAccessibleName(a);
      if (!name) {
        issues.push({
          type: "link-name",
          text: `a href="${truncate(href, 60)}"`,
        });
      }
    }

    const buttons = document.body
      ? document.body.querySelectorAll("button")
      : [];
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (shouldSkipForAudit(b)) continue;
      if (!isVisibleElement(b)) continue;
      const name = getAccessibleName(b);
      if (!name) {
        issues.push({
          type: "button-name",
          text: `button class="${truncate(getDeveloperClassString(b) || classNameToString(b), 80)}"`,
        });
      }
    }

    const inputs = document.body
      ? document.body.querySelectorAll(
          "input:not([type='hidden']), textarea, select",
        )
      : [];
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      if (shouldSkipForAudit(inp)) continue;
      if (!isVisibleElement(inp)) continue;
      const id = inp.getAttribute("id");
      let labelled = false;
      if (id) {
        const lbl = findLabelForId(id);
        if (lbl && lbl.textContent.trim()) labelled = true;
      }
      const al = inp.getAttribute("aria-label");
      const lb = inp.getAttribute("aria-labelledby");
      if (al && al.trim()) labelled = true;
      if (lb && lb.trim()) labelled = true;
      const wrapped = inp.closest("label");
      if (wrapped && wrapped.textContent.trim()) labelled = true;
      if (!labelled) {
        issues.push({
          type: "input-label",
          text: `${inp.tagName.toLowerCase()} type="${inp.getAttribute(
            "type",
          ) || ""}" class="${truncate(getDeveloperClassString(inp) || classNameToString(inp), 60)}"`,
        });
      }
    }

    return {
      issueCount: issues.length,
      examples: issues.slice(0, 15).map((x) => x.text),
    };
  }

  function auditSpacing() {
    const spacingCounts = Object.create(null);
    const all = document.body ? document.body.getElementsByTagName("*") : [];

    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (shouldSkipForAudit(el)) continue;
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisibleElement(el)) continue;

      const cs = getComputedStyle(el);
      const keys = ["marginTop", "marginBottom", "paddingTop", "paddingBottom"];
      for (let k = 0; k < keys.length; k++) {
        const px = parsePx(cs[keys[k]]);
        if (px !== 0) {
          const label = `${keys[k]}: ${px}px`;
          spacingCounts[label] = (spacingCounts[label] || 0) + 1;
        }
      }
    }

    const entries = Object.entries(spacingCounts).sort((a, b) => b[1] - a[1]);
    const unique = entries.length;
    const mostCommon = entries
      .slice(0, 10)
      .map(([v, c]) => ({ value: v, count: c }));
    const rare = entries
      .filter(([, c]) => c <= 2)
      .slice(-10)
      .map(([v]) => v);

    return {
      uniqueSpacingValues: unique,
      mostCommon,
      rareValues: rare,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Complexity (separate from quality)
  // ────────────────────────────────────────────────────────────────────────

  function computeComplexity() {
    const signals = [];
    const body = document.body;
    if (!body) {
      return {
        level: "low",
        signals: [],
        metrics: {
          domNodes: 0,
          sliderCount: 0,
          cmsItemCount: 0,
          svgCount: 0,
          interactionElementCount: 0,
          uniqueDeveloperClassCount: 0,
        },
      };
    }

    const all = body.getElementsByTagName("*");
    const domNodes = all.length;

    let sliderCount = 0;
    try {
      sliderCount = body.querySelectorAll(SLIDER_ROOT_SELECTOR).length;
    } catch (e) {
      sliderCount = 0;
    }

    const cmsItems = body.querySelectorAll(".w-dyn-item");
    const cmsItemCount = cmsItems.length;

    const svgs = body.getElementsByTagName("svg");
    const svgCount = svgs.length;

    const interactionEls = body.querySelectorAll(
      "[data-w-id], [data-w-tab], [data-w-anim], [data-ix]",
    );
    const interactionElementCount = interactionEls.length;

    const uniqueDevClasses = new Set();
    for (let i = 0; i < all.length; i++) {
      if (shouldSkipForAudit(all[i])) continue;
      const dev = getDeveloperClasses(all[i]);
      for (let j = 0; j < dev.length; j++) uniqueDevClasses.add(dev[j]);
    }

    if (domNodes > 1500) signals.push(`${domNodes} DOM nodes`);
    if (sliderCount >= 2) signals.push(`${sliderCount} sliders / carousels`);
    if (cmsItemCount > 20) signals.push(`${cmsItemCount} CMS items`);
    if (interactionElementCount > 30) {
      signals.push(`${interactionElementCount} interaction targets`);
    }
    if (svgCount > 8) signals.push(`${svgCount} SVGs`);
    if (uniqueDevClasses.size > 80) {
      signals.push(`${uniqueDevClasses.size} unique developer classes`);
    }

    let score = 0;
    if (domNodes > 3500) score += 3;
    else if (domNodes > 2000) score += 2;
    else if (domNodes > 1200) score += 1;

    if (sliderCount >= 3) score += 2;
    else if (sliderCount >= 1) score += 1;

    if (svgCount > 20) score += 2;
    else if (svgCount > 8) score += 1;

    if (cmsItemCount > 60) score += 2;
    else if (cmsItemCount > 20) score += 1;

    if (interactionElementCount > 60) score += 1;
    if (uniqueDevClasses.size > 120) score += 1;

    let level = "low";
    if (score >= 6) level = "high";
    else if (score >= 3) level = "medium";

    return {
      level,
      signals,
      metrics: {
        domNodes,
        sliderCount,
        cmsItemCount,
        svgCount,
        interactionElementCount,
        uniqueDeveloperClassCount: uniqueDevClasses.size,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Issue assembly + scoring
  // ────────────────────────────────────────────────────────────────────────

  function buildIssuesAndScore(parts) {
    const categories = [];

    const classIssues = [];
    const dc = parts.defaultClasses;
    if (dc.totalMatches > 0) {
      classIssues.push({
        category: "classNaming",
        scoreBucket: "classNaming",
        affectedElementsCount: Math.max(1, dc.affectedElements || dc.totalMatches),
        severity: dc.affectedElements > 40 ? "critical" : "warning",
        title: "Default Webflow-style class names detected",
        description: `Found ${dc.totalMatches} uses of generic Webflow classes across ${dc.affectedElements} elements. Rename to semantic, project-specific names.`,
        quickFix:
          "In Webflow Designer, rename classes (e.g. container → layout-shell) and delete unused combo classes.",
        examples: dc.topClasses.slice(0, 5).map(
          (x) => `${x.name} (${x.count}×)`,
        ),
      });
    } else {
      classIssues.push({
        category: "classNaming",
        scoreBucket: "classNaming",
        affectedElementsCount: 1,
        severity: "info",
        title: "No default Webflow class patterns detected",
        description:
          "No common auto-named classes like div-block or container-* were found among developer classes.",
        quickFix: "Keep using descriptive class names as you build.",
        examples: [],
      });
    }

    const messy = parts.messyClasses;
    if (messy.oneOffCount > 0) {
      classIssues.push({
        category: "classNaming",
        scoreBucket: "duplicates",
        affectedElementsCount: Math.max(1, messy.oneOffCount),
        severity: messy.oneOffCount > 80 ? "warning" : "info",
        title: "Many one-off classes",
        description: `${messy.oneOffCount} developer class names appear only once across ${messy.uniqueClassNames} unique classes. This often indicates unused or overly specific styles.`,
        quickFix:
          "Merge duplicate patterns into utility classes; remove unused styles from the Style panel.",
        examples: [`Unique developer classes: ${messy.uniqueClassNames}`],
      });
    }
    if (messy.longClassNames.length) {
      classIssues.push({
        category: "classNaming",
        scoreBucket: "classNaming",
        affectedElementsCount: Math.max(1, messy.longClassNames.length),
        severity: "warning",
        title: "Very long class names",
        description:
          "Some developer class names exceed 40 characters, which hurts readability and maintenance.",
        quickFix: "Shorten class names and rely on combo classes consistently.",
        examples: messy.longClassNames,
      });
    }
    if (messy.suspiciousClassNames.length) {
      classIssues.push({
        category: "classNaming",
        scoreBucket: "duplicates",
        affectedElementsCount: Math.max(1, messy.suspiciousClassNames.length),
        severity: "info",
        title: "Classes with numeric suffixes",
        description:
          "Some developer classes end in digits (often from duplication). Verify they are intentional.",
        quickFix: "Replace duplicates with a single shared class where possible.",
        examples: messy.suspiciousClassNames,
      });
    }

    categories.push({
      id: "classNaming",
      label: "Class naming & tidy classes",
      issues: classIssues,
    });

    const comboIssues = [];
    const combo = parts.combo;
    if (combo.issueCount > 0) {
      comboIssues.push({
        category: "comboClass",
        scoreBucket: "comboClasses",
        affectedElementsCount: Math.max(1, combo.issueCount),
        severity: "critical",
        title: "Heavy developer combo class stacks (6+)",
        description: `${combo.issueCount} elements use six or more developer classes (excluding Webflow runtime and third-party library classes). This increases specificity debt and makes refactors harder.`,
        quickFix:
          "Extract repeated stacks into a single class or a dedicated component style.",
        examples: combo.examples
          .filter((e) => e.level === "issue")
          .map((e) => `<${e.tagName}> ×${e.count} — ${truncate(e.className, 120)}`),
      });
    }
    if (combo.warningCount > 0) {
      comboIssues.push({
        category: "comboClass",
        scoreBucket: "comboClasses",
        affectedElementsCount: Math.max(1, combo.warningCount),
        severity: "warning",
        title: "Large developer combo class stacks (4–5)",
        description: `${combo.warningCount} elements use four or five developer classes (excluding runtime/library classes).`,
        quickFix: "Consider simplifying stacks with shared utilities.",
        examples: combo.examples
          .filter((e) => e.level === "warning")
          .map((e) => `<${e.tagName}> ×${e.count} — ${truncate(e.className, 120)}`),
      });
    }
    if (!comboIssues.length) {
      comboIssues.push({
        category: "comboClass",
        scoreBucket: "comboClasses",
        affectedElementsCount: 1,
        severity: "info",
        title: "Combo classes look lightweight",
        description:
          "Few developer-authored elements exceed the recommended class count thresholds.",
        quickFix: "Maintain small stacks as pages grow.",
        examples: [],
      });
    }
    categories.push({
      id: "comboClass",
      label: "Combo classes",
      issues: comboIssues,
    });

    const structureIssues = [];
    const st = parts.structure;
    if (st.layoutMaxDepth > 12) {
      structureIssues.push({
        category: "structure",
        scoreBucket: "structure",
        affectedElementsCount: 1,
        severity: "critical",
        title: "Very deep DOM nesting in layout",
        description: `Layout element nested ${st.layoutMaxDepth} levels deep (threshold 12, SVGs and slider widget internals are ignored).`,
        quickFix:
          "Flatten layout wrappers; merge redundant divs; prefer flex/grid on fewer containers.",
        examples: st.deepIssueExamples,
      });
    } else if (st.layoutMaxDepth > 8) {
      structureIssues.push({
        category: "structure",
        scoreBucket: "structure",
        affectedElementsCount: 1,
        severity: "warning",
        title: "Deep DOM nesting",
        description: `Layout depth is ${st.layoutMaxDepth} (warning threshold 8, ignoring SVGs and sliders). Maximum observed depth on the page including ignored contexts: ${st.maxDepth}.`,
        quickFix: "Reduce wrapper depth where possible.",
        examples: st.deepWarningExamples,
      });
    } else if (st.maxDepth > 12 && st.deepWarningExamples.length) {
      structureIssues.push({
        category: "structure",
        scoreBucket: "structure",
        affectedElementsCount: 1,
        severity: "info",
        title: "Deep nesting inside ignored contexts",
        description: `Maximum depth on the page is ${st.maxDepth}, but the deeply nested elements live inside ignored contexts (SVG / slider widget). Layout depth is within range.`,
        quickFix: "No action needed — these are library/asset internals.",
        examples: st.deepWarningExamples,
      });
    }

    if (st.emptyDivCount > 0) {
      structureIssues.push({
        category: "structure",
        scoreBucket: "structure",
        affectedElementsCount: Math.max(1, st.emptyDivCount),
        severity: st.emptyDivCount > 25 ? "warning" : "info",
        title: "Empty divs",
        description: `${st.emptyDivCount} divs have no text or embedded media/links/forms.`,
        quickFix: "Remove unused wrappers or add content; avoid spacer-only divs.",
        examples: st.emptyDivExamples,
      });
    }
    if (st.emptySectionCount > 0) {
      structureIssues.push({
        category: "structure",
        scoreBucket: "structure",
        affectedElementsCount: Math.max(1, st.emptySectionCount),
        severity: "warning",
        title: "Empty sections",
        description: `${st.emptySectionCount} section elements have no meaningful content.`,
        quickFix: "Use sections for major regions with real content or landmarks.",
        examples: st.emptySectionExamples,
      });
    }
    if (st.genericDivNestMax > 14) {
      structureIssues.push({
        category: "structure",
        scoreBucket: "structure",
        affectedElementsCount: Math.max(1, st.genericDivNestMax),
        severity: "warning",
        title: "Long chains of generic divs",
        description: `Found up to ${st.genericDivNestMax} nested divs in a row (ignoring SVG and slider internals).`,
        quickFix: "Introduce semantic wrappers (main, section) or fewer layout layers.",
        examples: [],
      });
    }
    if (!structureIssues.length) {
      structureIssues.push({
        category: "structure",
        scoreBucket: "structure",
        affectedElementsCount: 1,
        severity: "info",
        title: "Structure looks reasonable",
        description:
          "No major depth or empty-container patterns stood out in layout markup.",
        quickFix: "Re-run after large layout changes.",
        examples: [],
      });
    }
    categories.push({
      id: "structure",
      label: "Structure",
      issues: structureIssues,
    });

    const sem = parts.semantic;
    const semanticIssues = [];

    const ratio =
      sem.semanticCount === 0 && sem.divCount === 0
        ? 0
        : sem.divCount / Math.max(1, sem.semanticCount + sem.divCount);
    if (sem.semanticCount === 0 && sem.divCount > 15) {
      semanticIssues.push({
        category: "semantic",
        scoreBucket: "semantic",
        affectedElementsCount: Math.max(1, sem.divCount),
        severity: "warning",
        title: "Few semantic landmarks",
        description: `Found ${sem.divCount} divs and no article/aside/footer/header/main/nav/section landmarks.`,
        quickFix:
          "Add main, nav, header/footer, and section for major regions.",
        examples: [],
      });
    } else if (ratio > 0.92 && sem.divCount > 30) {
      semanticIssues.push({
        category: "semantic",
        scoreBucket: "semantic",
        affectedElementsCount: Math.max(1, sem.divCount),
        severity: "info",
        title: "High ratio of generic divs",
        description: `Div count (${sem.divCount}) dominates semantic elements (${sem.semanticCount}).`,
        quickFix: "Swap meaningful regions from div to semantic tags.",
        examples: [],
      });
    }

    if (sem.mainCount === 0) {
      semanticIssues.push({
        category: "semantic",
        scoreBucket: "semantic",
        affectedElementsCount: Math.max(1, sem.mainCount || 1),
        severity: "warning",
        title: "Missing main landmark",
        description: "No main element found for primary content.",
        quickFix: "Wrap primary content in a single main element.",
        examples: [],
      });
    } else if (sem.mainCount > 1) {
      semanticIssues.push({
        category: "semantic",
        scoreBucket: "semantic",
        affectedElementsCount: Math.max(1, sem.mainCount),
        severity: "warning",
        title: "Multiple main landmarks",
        description: `Found ${sem.mainCount} main elements; HTML expects one per document.`,
        quickFix: "Keep a single main and use sections inside it.",
        examples: [],
      });
    }

    if (sem.h1Count === 0) {
      semanticIssues.push({
        category: "semantic",
        scoreBucket: "semantic",
        affectedElementsCount: Math.max(1, sem.h1Count || 1),
        severity: "critical",
        title: "Missing h1 heading",
        description: "No h1 heading detected for the page topic.",
        quickFix: "Add one descriptive h1 near the top of main content.",
        examples: [],
      });
    } else if (sem.h1Count > 1) {
      semanticIssues.push({
        category: "semantic",
        scoreBucket: "semantic",
        affectedElementsCount: Math.max(1, sem.h1Count),
        severity: "critical",
        title: "Multiple h1 headings",
        description: `${sem.h1Count} h1 elements found; typically use one per page.`,
        quickFix: "Demote secondary titles to h2–h3.",
        examples: [],
      });
    }

    if (sem.skippedHeadingSignals.length) {
      semanticIssues.push({
        category: "semantic",
        scoreBucket: "semantic",
        affectedElementsCount: Math.max(1, sem.skippedHeadingSignals.length),
        severity: "warning",
        title: "Skipped heading levels",
        description:
          "Heading levels jump (for example from h2 to h4), which confuses outline navigation.",
        quickFix: "Adjust levels so they decrease by one between adjacent headings.",
        examples: sem.skippedHeadingSignals,
      });
    }

    if (sem.clickableDivExamples.length) {
      semanticIssues.push({
        category: "semantic",
        scoreBucket: "semantic",
        affectedElementsCount: Math.max(1, sem.clickableDivExamples.length),
        severity: "warning",
        title: "Clickable-looking divs",
        description:
          "Some divs behave like controls but lack button/link semantics (Webflow widgets such as nav/slider/dropdown are excluded).",
        quickFix:
          "Use button/a or add role, keyboard handlers, and focus styles.",
        examples: sem.clickableDivExamples,
      });
    }

    semanticIssues.push({
      category: "semantic",
      scoreBucket: "semantic",
      affectedElementsCount: Math.max(
        1,
        sem.headingOutline.slice(0, 12).length,
      ),
      severity: "info",
      title: "Heading outline (sample)",
      description: "First headings detected on the page.",
      quickFix: "Verify order reflects page structure.",
      examples: sem.headingOutline.slice(0, 12),
    });

    categories.push({
      id: "semantic",
      label: "Semantic HTML",
      issues: semanticIssues,
    });

    const a11y = parts.a11y;
    const a11yIssues = [];
    if (a11y.issueCount > 0) {
      a11yIssues.push({
        category: "accessibility",
        scoreBucket: "accessibility",
        affectedElementsCount: Math.max(1, a11y.issueCount),
        severity: a11y.issueCount > 15 ? "critical" : "warning",
        title: "Accessibility basics need attention",
        description: `${a11y.issueCount} potential issues with alt text, link targets, control names, or labels.`,
        quickFix:
          "Add meaningful alt, visible link text, aria-labels, and label associations.",
        examples: a11y.examples,
      });
    } else {
      a11yIssues.push({
        category: "accessibility",
        scoreBucket: "accessibility",
        affectedElementsCount: 1,
        severity: "info",
        title: "No obvious baseline accessibility issues",
        description:
          "Images had alt, links looked named, and inputs appeared labelled in this pass.",
        quickFix: "Still run automated and manual tests for full WCAG coverage.",
        examples: [],
      });
    }
    categories.push({
      id: "accessibility",
      label: "Accessibility basics",
      issues: a11yIssues,
    });

    const sp = parts.spacing;
    const spacingIssues = [];
    let spSeverity = "info";
    if (sp.uniqueSpacingValues > 24) {
      spSeverity = "warning";
    } else if (sp.uniqueSpacingValues > 16) {
      spSeverity = "warning";
    }
    spacingIssues.push({
      category: "spacing",
      scoreBucket: "spacing",
      affectedElementsCount: Math.max(1, sp.uniqueSpacingValues),
      severity: spSeverity,
      title: "Spacing scale consistency",
      description: `Found ${sp.uniqueSpacingValues} unique non-zero vertical spacing values (margins/padding). ${spSeverity === "info" ? "This is within a tidy range." : "Consider consolidating to a spacing scale."}`,
      quickFix:
        "Define spacing variables (e.g. 4/8/12/16px) and reuse in Webflow.",
      examples: [
        `Unique values: ${sp.uniqueSpacingValues}`,
        ...sp.mostCommon.slice(0, 5).map((x) => `${x.value} (${x.count}×)`),
        ...(sp.rareValues.length ? [`Rare: ${sp.rareValues.join(", ")}`] : []),
      ],
    });
    categories.push({
      id: "spacing",
      label: "Spacing consistency",
      issues: spacingIssues,
    });

    return computeWeightedScoreResult(categories, parts.complexity);
  }

  const SCORE_SEVERITY_WEIGHT = { critical: 8, warning: 4, info: 1 };

  const SCORE_CATEGORY_MULT = {
    accessibility: 1.4,
    semantic: 1.2,
    structure: 1.1,
    classNaming: 1,
    comboClasses: 1,
    spacing: 0.8,
    duplicates: 0.8,
  };

  const SCORE_CATEGORY_CAP = {
    accessibility: 25,
    semantic: 20,
    structure: 20,
    classNaming: 20,
    comboClasses: 15,
    spacing: 10,
    duplicates: 10,
  };

  const SCORE_BUCKET_LABEL = {
    accessibility: "Accessibility",
    semantic: "Semantic HTML",
    structure: "Structure",
    classNaming: "Class naming",
    comboClasses: "Combo classes",
    spacing: "Spacing",
    duplicates: "Duplicate / messy classes",
  };

  const SCORE_BUCKET_ORDER = [
    "accessibility",
    "semantic",
    "structure",
    "classNaming",
    "duplicates",
    "comboClasses",
    "spacing",
  ];

  // Titles of legitimately developer-impacting critical issues that may
  // trigger the critical caps. SVG/library/runtime-noise issues will never
  // surface as critical with the new filtering, but this list keeps the cap
  // explicit and auditable.
  const CRITICAL_CAP_ELIGIBLE_TITLES = new Set([
    "Missing h1 heading",
    "Multiple h1 headings",
    "Accessibility basics need attention",
    "Default Webflow-style class names detected",
    "Heavy developer combo class stacks (6+)",
    "Very deep DOM nesting in layout",
  ]);

  function intensityMultiplierForAffected(count) {
    const n = Math.max(1, Math.floor(Number(count)) || 1);
    if (n >= 16) return 2;
    if (n >= 6) return 1.5;
    if (n >= 2) return 1.25;
    return 1;
  }

  function scoreBucketFromCategoryId(catId) {
    if (catId === "comboClass") return "comboClasses";
    return catId;
  }

  function effectiveAffectedCount(issue) {
    const a = issue.affectedElementsCount;
    if (a !== null && a !== undefined && Number.isFinite(Number(a))) {
      const n = Math.floor(Number(a));
      if (n >= 1) return n;
    }
    const ex = issue.examples;
    if (Array.isArray(ex) && ex.length > 0) return ex.length;
    return 1;
  }

  function severityRank(sev) {
    if (sev === "critical") return 3;
    if (sev === "warning") return 2;
    return 1;
  }

  function worseSeverity(a, b) {
    return severityRank(a) >= severityRank(b) ? a : b;
  }

  function countEligibleCriticalIssues(categories) {
    let n = 0;
    for (let i = 0; i < categories.length; i++) {
      const issues = categories[i].issues || [];
      for (let j = 0; j < issues.length; j++) {
        const iss = issues[j];
        if (iss.severity !== "critical") continue;
        if (CRITICAL_CAP_ELIGIBLE_TITLES.has(iss.title)) n += 1;
      }
    }
    return n;
  }

  function scoreLabelFromFinal(score) {
    if (score >= 90) return "Clean";
    if (score >= 75) return "Mostly clean";
    if (score >= 60) return "Needs cleanup";
    if (score >= 40) return "Messy";
    return "Not handoff-ready";
  }

  function verdictFromFinalScore(score) {
    if (score >= 85) return "Ready for handoff";
    if (score >= 65) return "Needs light cleanup before handoff";
    if (score >= 50) return "Needs cleanup";
    return "Not ready yet";
  }

  function computeComplexityPenalty(complexity, realWarningPlusCritical) {
    if (!complexity || complexity.level !== "high") return 0;
    if (realWarningPlusCritical < 2) return 0;
    const extraByIssues = Math.min(5, realWarningPlusCritical - 1);
    return Math.max(0, Math.min(5, extraByIssues));
  }

  function computeWeightedScoreResult(categories, complexity) {
    const bucketRaw = Object.create(null);
    const bucketIssueCount = Object.create(null);
    const bucketTitles = Object.create(null);
    const bucketWorstSev = Object.create(null);

    for (let bi = 0; bi < SCORE_BUCKET_ORDER.length; bi++) {
      const b = SCORE_BUCKET_ORDER[bi];
      bucketRaw[b] = 0;
      bucketIssueCount[b] = 0;
      bucketTitles[b] = [];
      bucketWorstSev[b] = "info";
    }

    let warnPlusCritCount = 0;

    for (let ci = 0; ci < categories.length; ci++) {
      const cat = categories[ci];
      const issues = cat.issues || [];
      for (let ii = 0; ii < issues.length; ii++) {
        const issue = issues[ii];
        const bucket =
          issue.scoreBucket || scoreBucketFromCategoryId(cat.id);
        if (!SCORE_CATEGORY_MULT[bucket]) continue;

        const sev = issue.severity || "info";
        if (sev === "critical" || sev === "warning") warnPlusCritCount += 1;

        const w = SCORE_SEVERITY_WEIGHT[sev] ?? 1;
        const mult = SCORE_CATEGORY_MULT[bucket];
        const affected = effectiveAffectedCount(issue);
        const intensity = intensityMultiplierForAffected(affected);
        const contribution = w * mult * intensity;

        bucketRaw[bucket] += contribution;
        bucketIssueCount[bucket] += 1;
        if (issue.title) {
          bucketTitles[bucket].push(issue.title);
        }
        bucketWorstSev[bucket] = worseSeverity(bucketWorstSev[bucket], sev);
      }
    }

    const penalties = [];
    let totalApplied = 0;

    for (let pi = 0; pi < SCORE_BUCKET_ORDER.length; pi++) {
      const bucket = SCORE_BUCKET_ORDER[pi];
      const raw = bucketRaw[bucket];
      if (raw <= 0 && bucketIssueCount[bucket] === 0) continue;

      const cap = SCORE_CATEGORY_CAP[bucket];
      const applied = Math.min(raw, cap);
      if (applied < 0.01) continue;

      totalApplied += applied;

      const titles = bucketTitles[bucket];
      let reason = "";
      if (titles.length) {
        reason = titles.slice(0, 3).join("; ");
        if (titles.length > 3) reason += "; …";
      } else {
        reason = "Issues in this category contributed to the score.";
      }

      penalties.push({
        category: bucket,
        categoryLabel: SCORE_BUCKET_LABEL[bucket] || bucket,
        severity: bucketWorstSev[bucket],
        issueCount: bucketIssueCount[bucket],
        weight: SCORE_CATEGORY_MULT[bucket],
        penalty: Math.round(applied * 10) / 10,
        reason,
      });
    }

    const complexityPenalty = computeComplexityPenalty(
      complexity,
      warnPlusCritCount,
    );
    if (complexityPenalty > 0) {
      totalApplied += complexityPenalty;
      penalties.push({
        category: "complexity",
        categoryLabel: "Complexity adjustment",
        severity: "info",
        issueCount: 0,
        weight: 1,
        penalty: Math.round(complexityPenalty * 10) / 10,
        reason:
          "Page complexity is high and amplifies the impact of existing real issues (capped at −5).",
      });
    }

    let finalScore = 100 - totalApplied;
    finalScore = Math.max(0, Math.min(100, finalScore));

    const criticalCount = countEligibleCriticalIssues(categories);
    if (criticalCount >= 5) {
      finalScore = Math.min(finalScore, 59);
    } else if (criticalCount >= 3) {
      finalScore = Math.min(finalScore, 69);
    } else if (criticalCount >= 1) {
      finalScore = Math.min(finalScore, 79);
    }

    finalScore = Math.round(finalScore);

    const scoreLabel = scoreLabelFromFinal(finalScore);
    const verdict = verdictFromFinalScore(finalScore);

    const scoreBreakdown = {
      baseScore: 100,
      finalScore,
      penalties,
      criticalIssueCount: criticalCount,
      totalPenaltyApplied: Math.round(totalApplied * 10) / 10,
      complexityPenalty,
    };

    return {
      categories,
      score: finalScore,
      scoreLabel,
      verdict,
      scoreBreakdown,
    };
  }

  function buildSummary(score, scoreLabel, verdict, categories, complexity) {
    const lines = [];
    lines.push(
      `Cleanup score: ${score}/100 (${scoreLabel}). Complexity: ${complexity ? complexity.level : "low"}. Handoff verdict: ${verdict}.`,
    );
    const warnCrit = [];
    for (let i = 0; i < categories.length; i++) {
      const iss = categories[i].issues || [];
      for (let j = 0; j < iss.length; j++) {
        if (iss[j].severity === "warning" || iss[j].severity === "critical") {
          warnCrit.push(iss[j].title);
        }
      }
    }
    if (!warnCrit.length) {
      lines.push("No major warnings in this pass — nice work.");
    } else {
      lines.push(
        `Focus areas: ${warnCrit.slice(0, 4).join("; ")}${warnCrit.length > 4 ? "…" : ""}`,
      );
    }
    return lines.join(" ");
  }

  window.analyzeWebflowPage = function analyzeWebflowPage() {
    try {
      if (!document.body) {
        return {
          ok: false,
          error: "No document body — cannot analyze this page.",
        };
      }

      const ignoredFindings = collectIgnoredFindings(document.body);
      const complexity = computeComplexity();
      const defaultClasses = auditDefaultClasses();
      const combo = auditComboClasses();
      const messyClasses = auditClassMessiness();
      const structure = auditStructure();
      const semantic = auditSemantics();
      const a11y = auditAccessibility();
      const spacing = auditSpacing();

      const built = buildIssuesAndScore({
        defaultClasses,
        combo,
        messyClasses,
        structure,
        semantic,
        a11y,
        spacing,
        complexity,
      });

      const summary = buildSummary(
        built.score,
        built.scoreLabel,
        built.verdict,
        built.categories,
        complexity,
      );

      return {
        ok: true,
        score: built.score,
        scoreLabel: built.scoreLabel,
        verdict: built.verdict,
        scoreBreakdown: built.scoreBreakdown,
        summary,
        categories: built.categories,
        complexity,
        ignoredFindings,
        meta: {
          analyzedAt: new Date().toISOString(),
          url: location.href,
          title: document.title || "",
        },
        stats: {
          defaultClasses,
          combo,
          messyClasses,
          structure,
          semantic,
          a11y,
          spacing,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  };
})();
