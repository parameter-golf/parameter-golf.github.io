const filters = {
  search: "",
  hideNonRecord: false,
  mergedOnly: false,
  scoredOnly: false,
  includeValOnly: false
};

const sortState = {
  key: "rank",
  direction: "asc"
};

const paginationState = {
  page: 1,
  pageSize: 10
};

const statusOrder = {
  official: 0,
  open: 1,
  merged: 2,
  closed: 3
};

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }
  if (typeof value === "string" && value.toUpperCase().includes("PENDING")) {
    return "Pending";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Pending";
  }

  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC"
  });
  const day = date.toLocaleString("en-US", {
    day: "numeric",
    timeZone: "UTC"
  });
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hours}:${minutes}`;
}

function formatScore(value) {
  return typeof value === "number" && value > 0 ? value.toFixed(4) : "-";
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function byScoreThenDate(a, b) {
  const scoreA = Number.isFinite(a.metrics.valBpb) && a.metrics.valBpb > 0
    ? a.metrics.valBpb
    : Number.POSITIVE_INFINITY;
  const scoreB = Number.isFinite(b.metrics.valBpb) && b.metrics.valBpb > 0
    ? b.metrics.valBpb
    : Number.POSITIVE_INFINITY;
  if (scoreA !== scoreB) {
    return scoreA - scoreB;
  }
  return (b.submission.date || "").localeCompare(a.submission.date || "");
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function compareNumber(a, b) {
  const left = Number.isFinite(a) ? a : Number.POSITIVE_INFINITY;
  const right = Number.isFinite(b) ? b : Number.POSITIVE_INFINITY;
  return left - right;
}

function compareMetricValue(a, b, direction) {
  const leftValid = Number.isFinite(a) && a > 0;
  const rightValid = Number.isFinite(b) && b > 0;

  if (leftValid && rightValid) {
    return direction === "desc" ? b - a : a - b;
  }
  if (leftValid) {
    return direction === "desc" ? 1 : -1;
  }
  if (rightValid) {
    return direction === "desc" ? -1 : 1;
  }
  return 0;
}

function compareDateValue(a, b) {
  const left = Date.parse(a || "");
  const right = Date.parse(b || "");
  const leftValid = Number.isFinite(left);
  const rightValid = Number.isFinite(right);

  if (leftValid && rightValid) {
    return left - right;
  }
  if (leftValid) {
    return -1;
  }
  if (rightValid) {
    return 1;
  }
  return compareText(a, b);
}

function compareRecentDate(a, b) {
  return compareDateValue(b.submission.date, a.submission.date);
}

function trackLabel(entry) {
  return entry.category === "non-record" ? "Non-record" : "";
}

function buildRankMap(submissions) {
  const ranked = [...submissions].sort(byScoreThenDate);
  const rankMap = new Map();
  for (const [index, entry] of ranked.entries()) {
    rankMap.set(entry.id, index + 1);
  }
  return rankMap;
}

function sortSubmissions(submissions) {
  const items = [...submissions];
  items.sort((a, b) => {
    let result = 0;
    let alreadyDirected = false;
    switch (sortState.key) {
      case "rank":
        result = byScoreThenDate(a, b);
        break;
      case "score":
        result = compareMetricValue(a.metrics.valBpb, b.metrics.valBpb, sortState.direction);
        alreadyDirected = true;
        break;
      case "loss":
        result = compareMetricValue(a.metrics.valLoss, b.metrics.valLoss, sortState.direction);
        alreadyDirected = true;
        break;
      case "pr":
        result = compareText(a.pr?.title || a.record.folderName, b.pr?.title || b.record.folderName);
        break;
      case "run":
        result = compareText(a.submission.name || a.record.folderName, b.submission.name || b.record.folderName);
        break;
      case "track":
        result = compareText(trackLabel(a), trackLabel(b));
        break;
      case "status":
        result = compareNumber(statusOrder[a.status], statusOrder[b.status]);
        break;
      case "author":
        result = compareText(a.submission.author, b.submission.author);
        break;
      case "date":
        result = compareDateValue(a.submission.date, b.submission.date);
        break;
      default:
        result = byScoreThenDate(a, b);
        break;
    }

    if (result === 0) {
      if (sortState.key === "score" || sortState.key === "loss") {
        result = compareRecentDate(a, b);
      } else {
        result = byScoreThenDate(a, b);
      }
    }
    if (result === 0) {
      result = compareText(a.id, b.id);
    }
    return alreadyDirected || sortState.direction !== "desc" ? result : -result;
  });
  return items;
}

function updateSortButtons() {
  const buttons = document.querySelectorAll(".sort-button");
  for (const button of buttons) {
    const key = button.getAttribute("data-sort-key");
    const isActive = key === sortState.key;
    button.classList.toggle("active", isActive);
    button.setAttribute("data-direction", isActive ? sortState.direction : "");
  }
}

function updatePageSizeControl() {
  const select = document.getElementById("page-size-select");
  if (!select) {
    return;
  }
  select.value = String(paginationState.pageSize);
}

function updateSummary(summary) {
  const generatedAt = document.getElementById("generated-at");
  const bestOfficial = document.getElementById("best-official");
  const bestOpen = document.getElementById("best-open");
  const coverageCount = document.getElementById("coverage-count");
  if (!generatedAt || !bestOfficial || !bestOpen || !coverageCount) {
    return;
  }

  generatedAt.textContent = formatDate(summary.generatedAt);
  bestOfficial.textContent = formatScore(summary.best.officialMainTrack?.metrics.valBpb);
  bestOpen.textContent = formatScore(summary.best.openPrMainTrack?.metrics.valBpb);
  coverageCount.textContent = formatCount(summary.counts.openPr);
}

function buildVisibleSummary(summary, submissions) {
  const visible = [...submissions];
  const officialMain = visible
    .filter((entry) => entry.status === "official" && entry.category === "main-track")
    .sort(byScoreThenDate);
  const openMain = visible
    .filter((entry) => entry.status === "open" && entry.category === "main-track")
    .sort(byScoreThenDate);

  return {
    generatedAt: summary.generatedAt,
    counts: {
      openPr: visible.filter((entry) => entry.status === "open").length
    },
    best: {
      officialMainTrack: officialMain[0] || null,
      openPrMainTrack: openMain[0] || null
    }
  };
}

function buildEnrichmentMap(index) {
  const map = new Map();
  for (const entry of index?.entries || []) {
    map.set(String(entry.prNumber), entry);
  }
  return map;
}

function getEnrichment(enrichmentMap, entry) {
  if (!entry.pr?.number) {
    return null;
  }
  return enrichmentMap.get(String(entry.pr.number)) || null;
}

function usesValOnly(entry, enrichment) {
  return Boolean(entry.flags?.usesValOnly || enrichment?.flags?.usesValOnly);
}

function buildDisplayTags(entry, enrichment) {
  const tags = Array.isArray(enrichment?.tags) ? [...enrichment.tags] : [];
  if (usesValOnly(entry, enrichment) && !tags.includes("val-only")) {
    tags.unshift("val-only");
  }
  return tags.slice(0, 4);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function filterSubmissions(submissions, enrichmentMap) {
  return submissions.filter((entry) => {
    const enrichment = getEnrichment(enrichmentMap, entry);
    if (filters.mergedOnly && entry.status !== "official" && entry.status !== "merged") {
      return false;
    }
    if (filters.scoredOnly && (!Number.isFinite(entry.metrics.valBpb) || entry.metrics.valBpb <= 0)) {
      return false;
    }
    if (filters.hideNonRecord && entry.category === "non-record") {
      return false;
    }
    if (!filters.includeValOnly && usesValOnly(entry, enrichment)) {
      return false;
    }
    const query = filters.search.toLowerCase();
    if (/^\d+$/.test(query)) {
      return false;
    }
    const haystack = [
      entry.submission.name,
      entry.submission.author,
      entry.submission.githubId,
      enrichment?.summary,
      ...(buildDisplayTags(entry, enrichment))
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const searchMatch = !query || haystack.includes(query);
    return searchMatch;
  });
}

function buildPrimaryLink(entry) {
  if (entry.links.pr) {
    return {
      label: entry.pr?.title || "Open PR",
      href: entry.links.pr
    };
  }
  return {
    label: "Merged record",
    href: entry.links.folder
  };
}

function renderPagination(totalItems) {
  const pagination = document.getElementById("pagination");
  if (!pagination) {
    return;
  }
  pagination.replaceChildren();

  if (paginationState.pageSize === "all") {
    pagination.hidden = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / paginationState.pageSize));
  paginationState.page = Math.min(paginationState.page, totalPages);
  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }

  pagination.hidden = false;
  for (let page = 1; page <= totalPages; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pagination-button";
    button.textContent = String(page);
    if (page === paginationState.page) {
      button.classList.add("active");
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", () => {
      paginationState.page = page;
      render(window.__GOLF_VIEWER_DATA__);
    });
    pagination.appendChild(button);
  }
}

function renderRows(submissions) {
  const body = document.getElementById("submission-body");
  if (!body) {
    return;
  }
  body.replaceChildren();

  if (submissions.length === 0) {
    renderPagination(0);
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="8" class="empty-row">No submissions match the current filters.</td>`;
    body.appendChild(row);
    return;
  }

  const sorted = sortSubmissions(submissions);
  const rankMap = buildRankMap(submissions);
  const totalItems = sorted.length;
  const pageSize = paginationState.pageSize;
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  paginationState.page = Math.min(paginationState.page, totalPages);
  const start = pageSize === "all" ? 0 : (paginationState.page - 1) * pageSize;
  const end = pageSize === "all" ? totalItems : start + pageSize;
  const visibleItems = sorted.slice(start, end);
  const enrichmentMap = window.__GOLF_VIEWER_DATA__.enrichmentMap;

  for (const entry of visibleItems.entries().map((item) => item[1])) {
    const enrichment = getEnrichment(enrichmentMap, entry);
    const displayTags = buildDisplayTags(entry, enrichment);
    const summaryLine = enrichment?.summary
      ? `<p class="title-summary">${escapeHtml(enrichment.summary)}</p>`
      : "";
    const tagLine = displayTags.length > 0
      ? `<div class="title-tags">${displayTags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}</div>`
      : "";
    const row = document.createElement("tr");
    const statusClass = `status-${entry.status}`;
    const primaryLink = buildPrimaryLink(entry);
    const nonRecord = trackLabel(entry);
    const authorHref = entry.submission.githubId
      ? `https://github.com/${entry.submission.githubId}`
      : null;
    row.innerHTML = `
      <td><span class="rank-value">${rankMap.get(entry.id) || "-"}</span></td>
      <td class="title-cell">
        <a class="title-link run-name" href="${primaryLink.href}" target="_blank" rel="noreferrer">${entry.submission.name || entry.record.folderName}</a>
        ${summaryLine}
        ${tagLine}
      </td>
      <td class="metric-cell">
        <strong class="score-value">${formatScore(entry.metrics.valBpb)}</strong>
      </td>
      <td class="metric-cell"><span class="metric-value loss-value">${formatScore(entry.metrics.valLoss)}</span></td>
      <td class="author-cell">
        ${authorHref
          ? `<a class="author-link" href="${authorHref}" target="_blank" rel="noreferrer">${entry.submission.author || entry.submission.githubId}</a>`
          : `<span class="author-link">${entry.submission.author || "Unknown"}</span>`}
      </td>
      <td class="date-cell">${formatDate(entry.submission.date)}</td>
      <td class="status-cell"><span class="status-badge ${statusClass}">${entry.status}</span></td>
      <td class="track-cell">
        ${nonRecord ? `<span class="track-badge">${nonRecord}</span>` : ""}
      </td>
    `;
    body.appendChild(row);
  }

  renderPagination(totalItems);
}

function render(data) {
  window.__GOLF_VIEWER_DATA__ = data;
  const filtered = filterSubmissions(data.submissions.submissions, data.enrichmentMap);
  updateSummary(buildVisibleSummary(data.summary, filtered));
  renderRows(filtered);
  updateSortButtons();
  updatePageSizeControl();
}

async function load() {
  const [summaryResponse, submissionsResponse, enrichmentResponse] = await Promise.all([
    fetch("./data/summary.json"),
    fetch("./data/submissions.json"),
    fetch("./data/pr-enrichment/index.json")
  ]);
  if (!summaryResponse.ok || !submissionsResponse.ok) {
    throw new Error("Failed to load generated data files.");
  }
  const [summary, submissions, enrichmentIndex] = await Promise.all([
    summaryResponse.json(),
    submissionsResponse.json(),
    enrichmentResponse.ok
      ? enrichmentResponse.json()
      : Promise.resolve({ entries: [] })
  ]);
  render({ summary, submissions, enrichmentIndex, enrichmentMap: buildEnrichmentMap(enrichmentIndex) });
}

load().catch((error) => {
  const body = document.getElementById("submission-body");
  if (!body) {
    return;
  }
  body.innerHTML = `<tr><td colspan="8" class="empty-row">${error.message}</td></tr>`;
});

const searchInput = document.getElementById("search-input");
if (searchInput) {
  searchInput.addEventListener("input", (event) => {
    filters.search = event.target.value.trim();
    paginationState.page = 1;
    render(window.__GOLF_VIEWER_DATA__);
  });
}

const nonRecordToggle = document.getElementById("non-record-toggle");
if (nonRecordToggle) {
  nonRecordToggle.addEventListener("change", (event) => {
    filters.hideNonRecord = event.target.checked;
    paginationState.page = 1;
    render(window.__GOLF_VIEWER_DATA__);
  });
}

const mergedOnlyToggle = document.getElementById("merged-only-toggle");
if (mergedOnlyToggle) {
  mergedOnlyToggle.addEventListener("change", (event) => {
    filters.mergedOnly = event.target.checked;
    paginationState.page = 1;
    render(window.__GOLF_VIEWER_DATA__);
  });
}

const scoredOnlyToggle = document.getElementById("scored-only-toggle");
if (scoredOnlyToggle) {
  scoredOnlyToggle.addEventListener("change", (event) => {
    filters.scoredOnly = event.target.checked;
    paginationState.page = 1;
    render(window.__GOLF_VIEWER_DATA__);
  });
}

const valOnlyToggle = document.getElementById("val-only-toggle");
if (valOnlyToggle) {
  valOnlyToggle.checked = filters.includeValOnly;
  valOnlyToggle.addEventListener("change", (event) => {
    filters.includeValOnly = event.target.checked;
    paginationState.page = 1;
    render(window.__GOLF_VIEWER_DATA__);
  });
}

const pageSizeSelect = document.getElementById("page-size-select");
if (pageSizeSelect) {
  pageSizeSelect.addEventListener("change", (event) => {
    const value = event.target.value;
    paginationState.pageSize = value === "all" ? "all" : Number(value);
    paginationState.page = 1;
    render(window.__GOLF_VIEWER_DATA__);
  });
}

for (const button of document.querySelectorAll(".sort-button")) {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-sort-key");
    const defaultDirection = button.getAttribute("data-sort-default") || "asc";
    if (sortState.key === key) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    } else {
      sortState.key = key;
      sortState.direction = defaultDirection;
    }
    render(window.__GOLF_VIEWER_DATA__);
  });
}
