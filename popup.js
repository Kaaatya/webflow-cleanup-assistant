(function popupMain() {
  const analyzeBtn = document.getElementById("analyzeBtn");
  const copyJsonBtn = document.getElementById("copyJsonBtn");
  const copyClientBtn = document.getElementById("copyClientBtn");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");
  const scoreValueEl = document.getElementById("scoreValue");
  const scoreSublabelEl = document.getElementById("scoreSublabel");
  const summaryTextEl = document.getElementById("summaryText");
  const issuesContainerEl = document.getElementById("issuesContainer");
  const verdictBlockEl = document.getElementById("verdictBlock");
  const verdictLabelEl = document.getElementById("verdictLabel");
  const verdictHelperEl = document.getElementById("verdictHelper");
  const scoreCardEl = document.getElementById("scoreCard");
  const scoreBarFillEl = document.getElementById("scoreBarFill");
  const scoreBreakdownDetailsEl = document.getElementById(
    "scoreBreakdownDetails",
  );
  const scoreBreakdownListEl = document.getElementById("scoreBreakdownList");
  const countCriticalEl = document.getElementById("countCritical");
  const countWarningEl = document.getElementById("countWarning");
  const countInfoEl = document.getElementById("countInfo");
  const positiveStateEl = document.getElementById("positiveState");
  const complexityBadgeEl = document.getElementById("complexityBadge");
  const complexityValueEl = document.getElementById("complexityValue");
  const complexitySignalsEl = document.getElementById("complexitySignals");
  const ignoredNoteEl = document.getElementById("ignoredNote");

  /** @type {object | null} */
  let lastReport = null;

  /**
   * Returns a finite score in [0, 100], or null if missing / invalid.
   */
  function normalizeScore(raw) {
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
  }

  function scoreLabelFallback(score) {
    if (score >= 90) return "Clean";
    if (score >= 75) return "Mostly clean";
    if (score >= 60) return "Needs cleanup";
    if (score >= 40) return "Messy";
    return "Not handoff-ready";
  }

  function verdictFallback(score) {
    if (score >= 85) return "Ready for handoff";
    if (score >= 65) return "Needs cleanup";
    return "Not ready yet";
  }

  /** Lighthouse-style bar/badge colors from numeric score only */
  function getScoreTone(score) {
    if (score >= 90) return "green";
    if (score >= 50) return "orange";
    return "red";
  }

  const SCORE_TONE_KEYS = ["green", "orange", "red", "neutral"];

  function resetScoreToneClasses() {
    if (scoreCardEl) {
      for (let i = 0; i < SCORE_TONE_KEYS.length; i++) {
        scoreCardEl.classList.remove(`score-card--${SCORE_TONE_KEYS[i]}`);
      }
      scoreCardEl.classList.add("score-card--neutral");
    }
    if (verdictBlockEl) {
      for (let j = 0; j < SCORE_TONE_KEYS.length; j++) {
        verdictBlockEl.classList.remove(`score-badge--${SCORE_TONE_KEYS[j]}`);
      }
      verdictBlockEl.classList.add("score-badge--neutral");
    }
    if (scoreBarFillEl) {
      scoreBarFillEl.style.width = "0%";
    }
  }

  function applyScoreTone(tone) {
    const t =
      tone === "green" ||
      tone === "orange" ||
      tone === "red" ||
      tone === "neutral"
        ? tone
        : "neutral";
    if (scoreCardEl) {
      for (let i = 0; i < SCORE_TONE_KEYS.length; i++) {
        scoreCardEl.classList.remove(`score-card--${SCORE_TONE_KEYS[i]}`);
      }
      scoreCardEl.classList.add(`score-card--${t}`);
    }
    if (verdictBlockEl) {
      for (let j = 0; j < SCORE_TONE_KEYS.length; j++) {
        verdictBlockEl.classList.remove(`score-badge--${SCORE_TONE_KEYS[j]}`);
      }
      verdictBlockEl.classList.add(`score-badge--${t}`);
    }
  }

  function verdictHelperFromHandoffVerdict(verdict) {
    if (verdict === "Ready for handoff") {
      return "This Webflow page looks reasonably clean and ready for client review.";
    }
    if (verdict === "Needs light cleanup before handoff") {
      return "Page is in good shape overall — a small pass on the listed issues will make it handoff-ready.";
    }
    if (verdict === "Needs cleanup") {
      return "This page is usable, but some cleanup is recommended before handoff.";
    }
    if (verdict === "Not ready yet") {
      return "Structural, accessibility, or class issues should be fixed before handoff.";
    }
    return "";
  }

  const COMPLEXITY_LEVELS = ["low", "medium", "high"];

  function resetComplexityBadge() {
    if (!complexityBadgeEl) return;
    for (let i = 0; i < COMPLEXITY_LEVELS.length; i++) {
      complexityBadgeEl.classList.remove(
        `complexity-badge--${COMPLEXITY_LEVELS[i]}`,
      );
    }
    complexityBadgeEl.classList.add("complexity-badge--low");
    if (complexityValueEl) complexityValueEl.textContent = "—";
    if (complexitySignalsEl) complexitySignalsEl.textContent = "";
  }

  function applyComplexityBadge(complexity) {
    if (!complexityBadgeEl) return;
    const level =
      complexity && COMPLEXITY_LEVELS.includes(complexity.level)
        ? complexity.level
        : "low";
    for (let i = 0; i < COMPLEXITY_LEVELS.length; i++) {
      complexityBadgeEl.classList.remove(
        `complexity-badge--${COMPLEXITY_LEVELS[i]}`,
      );
    }
    complexityBadgeEl.classList.add(`complexity-badge--${level}`);
    if (complexityValueEl) {
      complexityValueEl.textContent =
        level.charAt(0).toUpperCase() + level.slice(1);
    }
    if (complexitySignalsEl) {
      const signals =
        complexity && Array.isArray(complexity.signals) ? complexity.signals : [];
      complexitySignalsEl.textContent = signals.length
        ? signals.slice(0, 4).join(" · ")
        : "";
    }
  }

  function formatIgnoredNote(ig) {
    if (!ig) return "";
    const parts = [];
    if (ig.thirdPartyClasses) {
      parts.push(`${ig.thirdPartyClasses} third-party / library classes`);
    }
    if (ig.webflowRuntimeClasses) {
      parts.push(`${ig.webflowRuntimeClasses} Webflow runtime classes`);
    }
    if (ig.svgElementsIgnored) {
      parts.push(`${ig.svgElementsIgnored} SVG elements`);
    }
    if (ig.sliderElementsIgnored) {
      parts.push(`${ig.sliderElementsIgnored} slider elements`);
    }
    if (!parts.length) return "";
    return `Technical noise ignored: ${parts.join(", ")}.`;
  }

  function renderIgnoredNote(report) {
    if (!ignoredNoteEl) return;
    const text = formatIgnoredNote(report.ignoredFindings);
    if (!text) {
      ignoredNoteEl.hidden = true;
      ignoredNoteEl.textContent = "";
      return;
    }
    ignoredNoteEl.hidden = false;
    ignoredNoteEl.textContent = text;
  }

  function countSeverities(report) {
    let critical = 0;
    let warning = 0;
    let info = 0;
    const cats = report.categories || [];
    for (let i = 0; i < cats.length; i++) {
      const issues = cats[i].issues || [];
      for (let j = 0; j < issues.length; j++) {
        const s = issues[j].severity || "info";
        if (s === "critical") critical += 1;
        else if (s === "warning") warning += 1;
        else info += 1;
      }
    }
    return { critical, warning, info };
  }

  function flattenIssuesForTopList(report) {
    const order = { critical: 0, warning: 1, info: 2 };
    const flat = [];
    const cats = report.categories || [];
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      const label = cat.label || cat.id || "General";
      const issues = cat.issues || [];
      for (let j = 0; j < issues.length; j++) {
        const issue = issues[j];
        flat.push({
          severity: issue.severity || "info",
          title: issue.title || "Issue",
          categoryLabel: label,
        });
      }
    }
    flat.sort((a, b) => {
      const da = order[a.severity] ?? 3;
      const db = order[b.severity] ?? 3;
      return da - db;
    });
    return flat;
  }

  function uniqueTopTitles(flat, max) {
    const seen = Object.create(null);
    const out = [];
    for (let i = 0; i < flat.length && out.length < max; i++) {
      const t = flat[i].title;
      if (seen[t]) continue;
      seen[t] = true;
      out.push(flat[i]);
    }
    return out;
  }

  function buildClientMarkdown(report, counts) {
    const normalized = normalizeScore(report.score);
    const flat = flattenIssuesForTopList(report);
    const top = uniqueTopTitles(flat, 3);
    const statusLine =
      normalized !== null
        ? report.scoreLabel || scoreLabelFallback(normalized)
        : "Unknown";
    const verdictLine =
      normalized !== null
        ? report.verdict || verdictFallback(normalized)
        : "Unknown";

    const complexity =
      report.complexity && report.complexity.level
        ? report.complexity.level
        : "low";

    let md = "# Webflow Cleanup Report\n\n";
    md += `Score: ${normalized !== null ? `${normalized}/100` : "—"}\n`;
    md += `Status: ${statusLine}\n`;
    md += `Verdict: ${verdictLine}\n`;
    md += `Complexity: ${complexity}\n\n`;
    md += "## Summary\n\n";
    md += `Critical issues: ${counts.critical}\n`;
    md += `Warnings: ${counts.warning}\n`;
    md += `Info: ${counts.info}\n\n`;

    const ignored = report.ignoredFindings;
    if (
      ignored &&
      (ignored.thirdPartyClasses ||
        ignored.webflowRuntimeClasses ||
        ignored.svgElementsIgnored ||
        ignored.sliderElementsIgnored)
    ) {
      md += "## Ignored technical noise\n\n";
      if (ignored.thirdPartyClasses) {
        md += `- Third-party / library classes ignored: ${ignored.thirdPartyClasses}\n`;
      }
      if (ignored.webflowRuntimeClasses) {
        md += `- Webflow runtime classes ignored: ${ignored.webflowRuntimeClasses}\n`;
      }
      if (ignored.svgElementsIgnored) {
        md += `- SVG elements ignored: ${ignored.svgElementsIgnored}\n`;
      }
      if (ignored.sliderElementsIgnored) {
        md += `- Slider elements ignored: ${ignored.sliderElementsIgnored}\n`;
      }
      md += "\n";
    }

    md += "## Top issues\n\n";

    if (!top.length) {
      md += "No issues recorded in this scan.\n\n";
    } else {
      for (let i = 0; i < top.length; i++) {
        const item = top[i];
        const sev =
          item.severity === "critical"
            ? "Critical"
            : item.severity === "warning"
              ? "Warning"
              : "Info";
        md += `${i + 1}. [${sev}] ${item.title}\n`;
      }
      md += "\n";
    }

    md += "## Recommended fixes\n\n";
    md +=
      "- Rename default Webflow classes into semantic reusable names.\n";
    md += "- Reduce long combo class chains.\n";
    md +=
      "- Add descriptive alt text to important images.\n";
    md +=
      "- Clean up empty divs and unused wrapper elements.\n";
    md +=
      "- Review heading hierarchy before client handoff.\n\n";
    md += "## Notes\n\n";
    md +=
      "This report was generated by Webflow Cleanup Assistant and is intended as a quick pre-handoff review.\n";

    return md;
  }

  function setStatus(message, kind) {
    statusEl.textContent = message || "";
    statusEl.classList.remove("error", "success");
    if (kind === "error") statusEl.classList.add("error");
    else if (kind === "success") statusEl.classList.add("success");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function renderScoreBreakdown(report) {
    if (!scoreBreakdownListEl) return;
    scoreBreakdownListEl.replaceChildren();

    const bd = report.scoreBreakdown;
    const ignored = report.ignoredFindings;

    const penaltiesTitle = el(
      "h4",
      "score-breakdown__section-title",
      "Penalties",
    );
    scoreBreakdownListEl.appendChild(penaltiesTitle);

    if (!bd || !Array.isArray(bd.penalties)) {
      scoreBreakdownListEl.appendChild(
        el(
          "p",
          "score-breakdown__empty",
          "No penalty breakdown available for this run.",
        ),
      );
    } else if (!bd.penalties.length) {
      scoreBreakdownListEl.appendChild(
        el(
          "p",
          "score-breakdown__empty",
          "No category penalties — score stayed at the maximum for applied rules.",
        ),
      );
    } else {
      for (let i = 0; i < bd.penalties.length; i++) {
        const p = bd.penalties[i];
        const label = p.categoryLabel || p.category || "Category";
        const row = el("div", "score-breakdown__row");
        const head = el("div", "score-breakdown__row-head");
        head.appendChild(el("span", "score-breakdown__cat", label));
        head.appendChild(
          el("span", "score-breakdown__penalty", `−${p.penalty}`),
        );
        row.appendChild(head);
        const reason = p.reason || "";
        row.appendChild(el("p", "score-breakdown__reason", reason));
        scoreBreakdownListEl.appendChild(row);
      }
    }

    if (
      ignored &&
      (ignored.thirdPartyClasses ||
        ignored.webflowRuntimeClasses ||
        ignored.svgElementsIgnored ||
        ignored.sliderElementsIgnored)
    ) {
      scoreBreakdownListEl.appendChild(
        el(
          "h4",
          "score-breakdown__section-title",
          "Ignored technical noise",
        ),
      );
      const ul = document.createElement("ul");
      ul.className = "score-breakdown__ignored-list";
      const rows = [
        ["Third-party / library classes ignored", ignored.thirdPartyClasses],
        ["Webflow runtime classes ignored", ignored.webflowRuntimeClasses],
        ["SVG elements ignored", ignored.svgElementsIgnored],
        ["Slider elements ignored", ignored.sliderElementsIgnored],
      ];
      for (let i = 0; i < rows.length; i++) {
        const [label, num] = rows[i];
        if (!num) continue;
        const li = document.createElement("li");
        li.appendChild(el("span", "label", label));
        li.appendChild(el("span", "num", String(num)));
        ul.appendChild(li);
      }
      scoreBreakdownListEl.appendChild(ul);
    }
  }

  function renderIssueCard(issue) {
    const card = el("div", "issue-card");

    const head = el("div", "issue-head");
    head.appendChild(el("h3", "issue-title", issue.title || "Issue"));
    head.appendChild(
      el(
        "span",
        `severity severity-${issue.severity || "info"}`,
        issue.severity || "info",
      ),
    );
    card.appendChild(head);

    if (issue.description) {
      card.appendChild(el("p", "issue-desc", issue.description));
    }
    if (issue.quickFix) {
      const q = el("p", "quick-fix");
      const strong = document.createElement("strong");
      strong.textContent = "Quick fix: ";
      q.appendChild(strong);
      q.appendChild(document.createTextNode(issue.quickFix));
      card.appendChild(q);
    }

    const ex = issue.examples;
    if (ex && ex.length) {
      const ul = document.createElement("ul");
      ul.className = "examples";
      for (let k = 0; k < ex.length; k++) {
        ul.appendChild(el("li", "", String(ex[k])));
      }
      card.appendChild(ul);
    }

    return card;
  }

  const SEVERITY_BANDS = [
    { key: "critical", title: "Critical" },
    { key: "warning", title: "Warnings" },
    { key: "info", title: "Info" },
  ];

  function renderIssuesBySeverity(categories) {
    issuesContainerEl.replaceChildren();

    for (let b = 0; b < SEVERITY_BANDS.length; b++) {
      const bandKey = SEVERITY_BANDS[b].key;
      const bandTitle = SEVERITY_BANDS[b].title;

      let bandHasAny = false;
      const bandWrap = el("div", "severity-band");

      const titleEl = el(
        "h3",
        `severity-band-title band-${bandKey}`,
        bandTitle,
      );
      bandWrap.appendChild(titleEl);

      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const filtered = (cat.issues || []).filter(
          (iss) => (iss.severity || "info") === bandKey,
        );
        if (!filtered.length) continue;

        bandHasAny = true;
        const block = el("div", "category-block");
        block.appendChild(el("h4", "category-title", cat.label || cat.id));

        for (let j = 0; j < filtered.length; j++) {
          block.appendChild(renderIssueCard(filtered[j]));
        }

        bandWrap.appendChild(block);
      }

      if (bandHasAny) {
        issuesContainerEl.appendChild(bandWrap);
      }
    }
  }

  function renderReport(report) {
    const normalized = normalizeScore(report.score);

    if (normalized === null) {
      resetScoreToneClasses();
      verdictLabelEl.textContent = "—";
      verdictHelperEl.textContent =
        "No valid score was returned. Try running Analyze again on a published page.";
      scoreValueEl.textContent = "—";
      if (scoreSublabelEl) scoreSublabelEl.textContent = "";
    } else {
      const tone = getScoreTone(normalized);
      applyScoreTone(tone);
      const v = report.verdict || verdictFallback(normalized);
      verdictLabelEl.textContent = v;
      verdictHelperEl.textContent = verdictHelperFromHandoffVerdict(v);
      scoreValueEl.textContent = String(Math.round(normalized));
      if (scoreSublabelEl) {
        scoreSublabelEl.textContent = String(
          report.scoreLabel || scoreLabelFallback(normalized),
        );
      }
      if (scoreBarFillEl) {
        scoreBarFillEl.style.width = `${normalized}%`;
      }
    }

    summaryTextEl.textContent = report.summary || "";

    const counts = countSeverities(report);
    countCriticalEl.textContent = String(counts.critical);
    countWarningEl.textContent = String(counts.warning);
    countInfoEl.textContent = String(counts.info);

    const noBlocking = counts.critical === 0 && counts.warning === 0;
    positiveStateEl.classList.toggle("hidden", !noBlocking);

    applyComplexityBadge(report.complexity);
    renderIgnoredNote(report);
    renderScoreBreakdown(report);
    if (scoreBreakdownDetailsEl) {
      scoreBreakdownDetailsEl.open = false;
    }

    renderIssuesBySeverity(report.categories || []);

    resultsEl.classList.remove("hidden");
    copyJsonBtn.disabled = false;
    copyClientBtn.disabled = false;
  }

  function clearResults() {
    resultsEl.classList.add("hidden");
    scoreValueEl.textContent = "—";
    if (scoreSublabelEl) scoreSublabelEl.textContent = "";
    summaryTextEl.textContent = "";
    issuesContainerEl.replaceChildren();
    verdictLabelEl.textContent = "—";
    verdictHelperEl.textContent = "";
    resetScoreToneClasses();
    resetComplexityBadge();
    if (ignoredNoteEl) {
      ignoredNoteEl.hidden = true;
      ignoredNoteEl.textContent = "";
    }
    countCriticalEl.textContent = "0";
    countWarningEl.textContent = "0";
    countInfoEl.textContent = "0";
    positiveStateEl.classList.add("hidden");
    if (scoreBreakdownListEl) scoreBreakdownListEl.replaceChildren();
    if (scoreBreakdownDetailsEl) scoreBreakdownDetailsEl.open = false;
    copyJsonBtn.disabled = true;
    copyClientBtn.disabled = true;
    lastReport = null;
  }

  async function analyzeActiveTab() {
    clearResults();
    setStatus("Analyzing page…", null);
    analyzeBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !tab.id) {
        setStatus(
          "We couldn’t read the active tab. Try focusing a browser tab and open this popup again.",
          "error",
        );
        return;
      }

      const restricted =
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("about:") ||
        tab.url.startsWith("devtools:");

      if (restricted) {
        setStatus(
          "This page can’t be analyzed here (built-in or restricted URL). Open your published Webflow site in a normal tab, then click Analyze again.",
          "error",
        );
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });

      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const fn = window.analyzeWebflowPage;
          if (typeof fn !== "function") {
            return {
              ok: false,
              error:
                "Analyzer not ready. Reload the page and try Analyze again.",
            };
          }
          return fn();
        },
      });

      const raw = injected && injected[0] ? injected[0].result : null;

      if (!raw || !raw.ok) {
        const msg =
          raw && raw.error
            ? raw.error
            : "Something went wrong during analysis.";
        setStatus(msg, "error");
        return;
      }

      lastReport = raw;
      renderReport(raw);

      const c = countSeverities(raw);
      if (c.critical === 0 && c.warning === 0) {
        setStatus(
          "Analysis complete — no critical or warning issues found.",
          "success",
        );
      } else {
        setStatus("Analysis complete.", "success");
      }
    } catch (err) {
      const msg =
        err && err.message
          ? err.message
          : "Something went wrong while analyzing this page.";
      const friendly =
        /cannot access|Cannot access|chrome:\/\/|Extension context invalidated/i.test(
          msg,
        )
          ? "This page doesn’t allow the extension to run. Open a standard https:// website (such as your published Webflow URL) and try again."
          : msg;
      setStatus(friendly, "error");
    } finally {
      analyzeBtn.disabled = false;
    }
  }

  async function copyReportJson() {
    if (!lastReport) return;
    try {
      const json = JSON.stringify(lastReport, null, 2);
      await navigator.clipboard.writeText(json);
      setStatus("Full JSON report copied to clipboard.", "success");
    } catch (e) {
      setStatus("Could not copy to clipboard.", "error");
    }
  }

  async function copyClientReport() {
    if (!lastReport) return;
    try {
      const counts = countSeverities(lastReport);
      const md = buildClientMarkdown(lastReport, counts);
      await navigator.clipboard.writeText(md);
      setStatus("Client-friendly Markdown report copied to clipboard.", "success");
    } catch (e) {
      setStatus("Could not copy to clipboard.", "error");
    }
  }

  analyzeBtn.addEventListener("click", () => {
    analyzeActiveTab();
  });

  copyJsonBtn.addEventListener("click", () => {
    copyReportJson();
  });

  copyClientBtn.addEventListener("click", () => {
    copyClientReport();
  });
})();
