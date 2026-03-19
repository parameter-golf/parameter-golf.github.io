const filters = {
  search: ""
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

function updateSummary(summary) {
  const generatedAt = document.getElementById("generated-at");
  const bestOfficial = document.getElementById("best-official");
  const bestOfficialName = document.getElementById("best-official-name");
  const bestOpen = document.getElementById("best-open");
  const bestOpenName = document.getElementById("best-open-name");
  const coverageCount = document.getElementById("coverage-count");
  const coverageBreakdown = document.getElementById("coverage-breakdown");
  if (!generatedAt || !bestOfficial || !bestOfficialName || !bestOpen || !bestOpenName || !coverageCount || !coverageBreakdown) {
    return;
  }

  generatedAt.textContent = formatDate(summary.generatedAt);
  bestOfficial.textContent = formatScore(summary.best.officialMainTrack?.metrics.valBpb);
  bestOfficialName.textContent = summary.best.officialMainTrack?.submission.name || "No official records found";
  bestOpen.textContent = formatScore(summary.best.openPrMainTrack?.metrics.valBpb);
  bestOpenName.textContent = summary.best.openPrMainTrack?.submission.name || "No open PR submissions found";
  coverageCount.textContent = formatCount(summary.counts.submissions);
  coverageBreakdown.textContent = `${summary.counts.official} main, ${summary.counts.openPr} open, ${summary.counts.readmeListed} listed`;
}

function filterSubmissions(submissions) {
  return submissions.filter((entry) => {
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

  for (const entry of submissions.sort(byScoreThenDate)) {
    const row = document.createElement("tr");
    const statusClass = `status-${entry.status}`;
    const prMeta = entry.pr ? `#${entry.pr.number}` : "-";
    const readmeMeta = entry.provenance.listedInReadme ? "Listed" : "Not listed";
    const primaryLink = buildPrimaryLink(entry);
    row.innerHTML = `
      <td><span class="status-badge ${statusClass}">${entry.status}</span></td>
      <td><span class="track-badge">${entry.track.label}</span></td>
      <td>
        <span class="run-name">${entry.submission.name || entry.record.folderName}</span>
      </td>
      <td>
        <strong>${formatScore(entry.metrics.valBpb)}</strong>
        <div class="meta">loss ${entry.metrics.valLoss ? entry.metrics.valLoss.toFixed(4) : "-"}</div>
      </td>
      <td>
        <strong>${prMeta}</strong>
      </td>
      <td>
        <span class="status-badge ${entry.provenance.listedInReadme ? "status-official" : "status-closed"}">${readmeMeta}</span>
      </td>
      <td>
        <strong>${entry.submission.author || "Unknown"}</strong>
        <div class="meta">${entry.submission.githubId || "-"}</div>
      </td>
      <td>${formatDate(entry.submission.date)}</td>
      <td><div class="link-cluster"><a href="${primaryLink.href}" target="_blank" rel="noreferrer">${primaryLink.label}</a></div></td>
    `;
    body.appendChild(row);
  }
}

function render(data) {
  window.__GOLF_VIEWER_DATA__ = data;
  updateSummary(data.summary);
  renderRows(filterSubmissions(data.submissions.submissions));
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
