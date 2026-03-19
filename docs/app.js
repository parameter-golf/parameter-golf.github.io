const filters = {
  search: "",
  hideNonRecord: false
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
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
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
      case "pr":
        result = compareNumber(a.pr?.number, b.pr?.number);
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
        result = compareText(a.submission.date, b.submission.date);
        break;
      case "open":
        result = compareText(buildPrimaryLink(a).label, buildPrimaryLink(b).label);
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
  const generatedAtNote = document.getElementById("generated-at-note");
  const bestOfficial = document.getElementById("best-official");
  const bestOfficialName = document.getElementById("best-official-name");
  const bestOpen = document.getElementById("best-open");
  const bestOpenName = document.getElementById("best-open-name");
  const coverageCount = document.getElementById("coverage-count");
  const coverageBreakdown = document.getElementById("coverage-breakdown");
  if (!generatedAt || !generatedAtNote || !bestOfficial || !bestOfficialName || !bestOpen || !bestOpenName || !coverageCount || !coverageBreakdown) {
    return;
  }

  generatedAt.textContent = formatDate(summary.generatedAt);
  generatedAtNote.textContent = "";
  bestOfficial.textContent = formatScore(summary.best.officialMainTrack?.metrics.valBpb);
  bestOfficialName.textContent = "";
  bestOpen.textContent = formatScore(summary.best.openPrMainTrack?.metrics.valBpb);
  bestOpenName.textContent = "";
  coverageCount.textContent = formatCount(summary.counts.openPr);
  coverageBreakdown.textContent = "";
}

function filterSubmissions(submissions) {
  return submissions.filter((entry) => {
    if (filters.hideNonRecord && entry.category === "non-record") {
      return false;
    }
    const haystack = [
      entry.submission.name,
      entry.submission.author,
      entry.submission.githubId,
      entry.record.folderName,
      entry.record.folderPath,
      entry.pr?.title,
      entry.pr?.number != null ? String(entry.pr.number) : null
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const searchMatch = !filters.search || haystack.includes(filters.search.toLowerCase());
    return searchMatch;
  });
}

function buildPrimaryLink(entry) {
  if (entry.links.pr) {
    return {
      label: "PR",
      href: entry.links.pr
    };
  }
  return {
    label: "Folder",
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
    row.innerHTML = `<td colspan="9" class="empty-row">No submissions match the current filters.</td>`;
    body.appendChild(row);
    return;
  }

  const sorted = sortSubmissions(submissions);
  const rankMap = buildRankMap(submissions);

  for (const entry of sorted.entries().map((item) => item[1])) {
    const row = document.createElement("tr");
    const statusClass = `status-${entry.status}`;
    const prMeta = entry.pr ? `#${entry.pr.number}` : "-";
    const primaryLink = buildPrimaryLink(entry);
    const nonRecord = trackLabel(entry);
    row.innerHTML = `
      <td><strong>${rankMap.get(entry.id) || "-"}</strong></td>
      <td><strong>${prMeta}</strong></td>
      <td class="title-cell">
        <span class="run-name">${entry.submission.name || entry.record.folderName}</span>
      </td>
      <td class="score-cell">
        <strong class="score-value">${formatScore(entry.metrics.valBpb)}</strong>
        <div class="meta score-meta">loss ${entry.metrics.valLoss ? entry.metrics.valLoss.toFixed(4) : "-"}</div>
      </td>
      <td><span class="status-badge ${statusClass}">${entry.status}</span></td>
      <td>
        <strong>${entry.submission.author || "Unknown"}</strong>
        <div class="meta">${entry.submission.githubId || "-"}</div>
      </td>
      <td>${formatDate(entry.submission.date)}</td>
      <td><div class="link-cluster"><a href="${primaryLink.href}" target="_blank" rel="noreferrer">${primaryLink.label}</a></div></td>
      <td>
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
  body.innerHTML = `<tr><td colspan="9" class="empty-row">${error.message}</td></tr>`;
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
