const filters = {
  search: "",
  hideNonRecord: false,
  mergedOnly: false
};

const sortState = {
  key: "rank",
  direction: "asc"
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
    switch (sortState.key) {
      case "rank":
      case "score":
        result = byScoreThenDate(a, b);
        break;
      case "loss":
        result = compareNumber(a.metrics.valLoss, b.metrics.valLoss);
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
      result = byScoreThenDate(a, b);
    }
    return sortState.direction === "desc" ? -result : result;
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

function filterSubmissions(submissions) {
  return submissions.filter((entry) => {
    if (filters.mergedOnly && entry.status !== "official" && entry.status !== "merged") {
      return false;
    }
    if (filters.hideNonRecord && entry.category === "non-record") {
      return false;
    }
    const query = filters.search.toLowerCase();
    if (/^\d+$/.test(query)) {
      return false;
    }
    const haystack = [
      entry.submission.name,
      entry.submission.author,
      entry.submission.githubId
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

function renderRows(submissions) {
  const body = document.getElementById("submission-body");
  if (!body) {
    return;
  }
  body.replaceChildren();

  if (submissions.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="8" class="empty-row">No submissions match the current filters.</td>`;
    body.appendChild(row);
    return;
  }

  const sorted = sortSubmissions(submissions);
  const rankMap = buildRankMap(submissions);

  for (const entry of sorted.entries().map((item) => item[1])) {
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
}

function render(data) {
  window.__GOLF_VIEWER_DATA__ = data;
  updateSummary(data.summary);
  renderRows(filterSubmissions(data.submissions.submissions));
  updateSortButtons();
}

async function load() {
  const [summaryResponse, submissionsResponse] = await Promise.all([
    fetch("./data/summary.json"),
    fetch("./data/submissions.json")
  ]);
  if (!summaryResponse.ok || !submissionsResponse.ok) {
    throw new Error("Failed to load generated data files.");
  }
  const [summary, submissions] = await Promise.all([summaryResponse.json(), submissionsResponse.json()]);
  render({ summary, submissions });
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
    render(window.__GOLF_VIEWER_DATA__);
  });
}

const nonRecordToggle = document.getElementById("non-record-toggle");
if (nonRecordToggle) {
  nonRecordToggle.addEventListener("change", (event) => {
    filters.hideNonRecord = event.target.checked;
    render(window.__GOLF_VIEWER_DATA__);
  });
}

const mergedOnlyToggle = document.getElementById("merged-only-toggle");
if (mergedOnlyToggle) {
  mergedOnlyToggle.addEventListener("change", (event) => {
    filters.mergedOnly = event.target.checked;
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
