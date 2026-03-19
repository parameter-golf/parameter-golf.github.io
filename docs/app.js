const filters = {
  status: "all",
  track: "all"
};

const statusOptions = [
  ["all", "All statuses"],
  ["official", "Official"],
  ["open", "Open PR"],
  ["merged", "Merged PR"],
  ["closed", "Closed PR"]
];

const trackOptions = [
  ["all", "All tracks"],
  ["main-track", "Main track"],
  ["non-record", "Non-record"],
  ["unknown", "Other"]
];

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
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

function createPills(containerId, key, options) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  for (const [value, label] of options) {
    const button = document.createElement("button");
    button.className = `pill${filters[key] === value ? " active" : ""}`;
    button.textContent = label;
    button.type = "button";
    button.addEventListener("click", () => {
      filters[key] = value;
      render(window.__GOLF_VIEWER_DATA__);
    });
    container.appendChild(button);
  }
}

function updateSummary(summary) {
  document.getElementById("generated-at").textContent = formatDate(summary.generatedAt);
  document.getElementById("best-official").textContent = formatScore(summary.best.officialMainTrack?.metrics.valBpb);
  document.getElementById("best-official-name").textContent =
    summary.best.officialMainTrack?.submission.name || "No official records found";
  document.getElementById("best-open").textContent = formatScore(summary.best.openPrMainTrack?.metrics.valBpb);
  document.getElementById("best-open-name").textContent =
    summary.best.openPrMainTrack?.submission.name || "No open PR submissions found";
  document.getElementById("coverage-count").textContent = formatCount(summary.counts.submissions);
  document.getElementById("coverage-breakdown").textContent =
    `${summary.counts.official} official, ${summary.counts.openPr} open PR, ${summary.counts.mergedPr} merged PR, ${summary.counts.closedPr} closed PR`;
}

function filterSubmissions(submissions) {
  return submissions.filter((entry) => {
    const statusMatch = filters.status === "all" || entry.status === filters.status;
    const trackMatch = filters.track === "all" || entry.category === filters.track;
    return statusMatch && trackMatch;
  });
}

function buildLinks(entry) {
  const links = [];
  if (entry.links.pr) {
    links.push(["PR", entry.links.pr]);
  }
  links.push(["Folder", entry.links.folder]);
  links.push(["JSON", entry.links.submissionJson]);
  links.push(["README", entry.links.readme]);
  if (entry.links.trainLog) {
    links.push(["Log", entry.links.trainLog]);
  }
  return links;
}

function renderRows(submissions) {
  const body = document.getElementById("submission-body");
  body.replaceChildren();

  if (submissions.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7" class="empty-row">No submissions match the current filters.</td>`;
    body.appendChild(row);
    return;
  }

  for (const entry of submissions.sort(byScoreThenDate)) {
    const row = document.createElement("tr");
    const statusClass = `status-${entry.status}`;
    const prMeta = entry.pr ? `PR #${entry.pr.number}` : "Merged on main";
    const linksHtml = buildLinks(entry)
      .map(([label, href]) => `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`)
      .join("");
    row.innerHTML = `
      <td><span class="status-badge ${statusClass}">${entry.status}</span></td>
      <td><span class="track-badge">${entry.track.label}</span></td>
      <td>
        <span class="run-name">${entry.submission.name || entry.record.folderName}</span>
        <div class="meta">${prMeta}</div>
      </td>
      <td>
        <strong>${formatScore(entry.metrics.valBpb)}</strong>
        <div class="meta">loss ${entry.metrics.valLoss ? entry.metrics.valLoss.toFixed(4) : "-"}</div>
      </td>
      <td>
        <strong>${entry.submission.author || "Unknown"}</strong>
        <div class="meta">${entry.submission.githubId || "-"}</div>
      </td>
      <td>${formatDate(entry.submission.date)}</td>
      <td><div class="link-cluster">${linksHtml}</div></td>
    `;
    body.appendChild(row);
  }
}

function render(data) {
  window.__GOLF_VIEWER_DATA__ = data;
  updateSummary(data.summary);
  createPills("status-filters", "status", statusOptions);
  createPills("track-filters", "track", trackOptions);
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
  body.innerHTML = `<tr><td colspan="7" class="empty-row">${error.message}</td></tr>`;
});
