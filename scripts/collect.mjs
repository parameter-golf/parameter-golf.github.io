import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OWNER = "openai";
const REPO = "parameter-golf";
const SOURCE_REPO = `${OWNER}/${REPO}`;
const API_ROOT = "https://api.github.com";
const RAW_ROOT = "https://raw.githubusercontent.com";
const SITE_ROOT = process.env.SITE_ROOT || "";
const OUTPUT_DIR = path.resolve("docs/data");
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const FETCH_HEADERS = {
  "Accept": "application/vnd.github+json",
  "User-Agent": "golf-parameter-leaderboard-collector",
  ...(TOKEN ? { "Authorization": `Bearer ${TOKEN}` } : {})
};

function trackInfoFromPath(recordPath) {
  const parts = recordPath.split("/");
  const slug = parts[1] || "unknown";
  if (slug === "track_10min_16mb") {
    return {
      path: parts.slice(0, 2).join("/"),
      slug,
      label: "10 Minute / 16MB",
      official: true,
      category: "main-track"
    };
  }
  if (slug === "track_non_record_16mb") {
    return {
      path: parts.slice(0, 2).join("/"),
      slug,
      label: "Non-record / 16MB",
      official: false,
      category: "non-record"
    };
  }
  return {
    path: parts.slice(0, 2).join("/"),
    slug,
    label: slug.replaceAll("_", " "),
    official: false,
    category: "unknown"
  };
}

function buildBlobUrl(ref, filePath) {
  return `https://github.com/${SOURCE_REPO}/blob/${ref}/${filePath}`;
}

function buildTreeUrl(ref, folderPath) {
  return `https://github.com/${SOURCE_REPO}/tree/${ref}/${folderPath}`;
}

function buildRawUrl(ref, filePath) {
  return `${RAW_ROOT}/${SOURCE_REPO}/${ref}/${filePath}`;
}

function stableId(prefix, submissionPath) {
  return `${prefix}-${submissionPath.replaceAll("/", "-").replaceAll(".", "-")}`;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function scoreOrInfinity(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : Number.POSITIVE_INFINITY;
}

function decodeGitHubContent(data) {
  if (typeof data.content !== "string") {
    throw new Error("No file content returned by GitHub contents API.");
  }
  return Buffer.from(data.content, "base64").toString("utf8");
}

async function requestJson(url) {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    const body = await response.text();
    const hint = response.status === 403 && body.includes("rate limit exceeded")
      ? " Configure GITHUB_TOKEN or GH_TOKEN to raise the rate limit."
      : "";
    throw new Error(`GitHub API ${response.status} for ${url}: ${body.slice(0, 400)}${hint}`);
  }
  return {
    data: await response.json(),
    headers: response.headers
  };
}

function nextPageFromLink(linkHeader) {
  if (!linkHeader) {
    return null;
  }
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function paginate(url) {
  const results = [];
  let nextUrl = url;
  while (nextUrl) {
    const { data, headers } = await requestJson(nextUrl);
    if (!Array.isArray(data)) {
      throw new Error(`Expected array response for ${nextUrl}`);
    }
    results.push(...data);
    nextUrl = nextPageFromLink(headers.get("link"));
  }
  return results;
}

async function fetchContentJson(contentsUrl) {
  const { data } = await requestJson(contentsUrl);
  const decoded = decodeGitHubContent(data);
  return {
    data: JSON.parse(decoded),
    path: data.path
  };
}

async function fetchContentText(contentsUrl) {
  const { data } = await requestJson(contentsUrl);
  return {
    text: decodeGitHubContent(data),
    path: data.path
  };
}

function normalizeSubmission({
  source,
  status,
  submissionPath,
  payload,
  ref,
  pr = null
}) {
  const folderPath = submissionPath.replace(/\/submission\.json$/, "");
  const folderName = folderPath.split("/").at(-1) || folderPath;
  const track = trackInfoFromPath(folderPath);
  const prefix = source === "official" ? "official" : `pr-${pr.number}`;
  const prAuthorLogin = textOrNull(pr?.user?.login);
  const prAuthorName = textOrNull(pr?.user?.name);
  const submissionAuthor = textOrNull(payload.author) || prAuthorName || prAuthorLogin;
  const submissionGithubId = textOrNull(payload.github_id) || prAuthorLogin;
  const submissionDate = textOrNull(payload.date) || textOrNull(pr?.created_at);
  return {
    id: stableId(prefix, submissionPath),
    source,
    status,
    category: track.category,
    track,
    record: {
      folderName,
      folderPath,
      submissionPath,
      readmePath: `${folderPath}/README.md`,
      trainLogPath: `${folderPath}/train.log`,
      scriptPath: `${folderPath}/train_gpt.py`
    },
    submission: {
      author: submissionAuthor,
      githubId: submissionGithubId,
      name: textOrNull(payload.name),
      blurb: textOrNull(payload.blurb),
      date: submissionDate
    },
    metrics: {
      valBpb: numberOrNull(payload.val_bpb),
      valLoss: numberOrNull(payload.val_loss),
      preQuantValBpb: numberOrNull(payload.pre_quant_val_bpb),
      preQuantValLoss: numberOrNull(payload.pre_quant_val_loss),
      stepStop: numberOrNull(payload.step_stop),
      wallclockSeconds: numberOrNull(payload.wallclock_seconds),
      evalTimeSeconds: numberOrNull(payload.eval_time_seconds)
    },
    artifact: {
      bytesTotal: numberOrNull(payload.bytes_total),
      bytesCode: numberOrNull(payload.bytes_code),
      bytesModelInt8Zlib: numberOrNull(payload.bytes_model_int8_zlib)
    },
    pr: pr
      ? {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          draft: pr.draft,
          mergedAt: pr.merged_at,
          htmlUrl: pr.html_url,
          authorLogin: prAuthorLogin,
          authorName: prAuthorName,
          createdAt: textOrNull(pr.created_at),
          headSha: pr.head.sha,
          headRepo: pr.head.repo?.full_name || null
        }
      : null,
    links: {
      submissionJson: buildRawUrl(ref, submissionPath),
      readme: buildBlobUrl(ref, `${folderPath}/README.md`),
      trainLog: buildBlobUrl(ref, `${folderPath}/train.log`),
      script: buildBlobUrl(ref, `${folderPath}/train_gpt.py`),
      folder: buildTreeUrl(ref, folderPath),
      pr: pr ? pr.html_url : null
    }
  };
}

function parseReadmeListedFolders(readmeText) {
  const listed = new Set();
  const regex = /\((records\/[^)]+\/README\.md)\)/g;
  for (const match of readmeText.matchAll(regex)) {
    const readmePath = match[1];
    listed.add(readmePath.replace(/\/README\.md$/, ""));
  }
  return listed;
}

async function fetchReadmeListedFolders(report) {
  try {
    const { text } = await fetchContentText(
      `${API_ROOT}/repos/${SOURCE_REPO}/contents/README.md?ref=main`
    );
    return parseReadmeListedFolders(text);
  } catch (error) {
    report.errors.push({
      stage: "readme-index",
      message: error.message
    });
    return new Set();
  }
}

function preferredPr(currentPr, nextPr) {
  if (!currentPr) {
    return nextPr;
  }
  if (!nextPr) {
    return currentPr;
  }
  const rank = (pr) => {
    if (pr.state === "open") {
      return 3;
    }
    if (pr.mergedAt) {
      return 2;
    }
    return 1;
  };
  const currentRank = rank(currentPr);
  const nextRank = rank(nextPr);
  if (nextRank !== currentRank) {
    return nextRank > currentRank ? nextPr : currentPr;
  }
  return (nextPr.number || 0) > (currentPr.number || 0) ? nextPr : currentPr;
}

function mergeSubmissions(entries, readmeListedFolders) {
  const merged = new Map();
  const sorted = [...entries].sort((a, b) => {
    if (a.source === b.source) {
      return 0;
    }
    return a.source === "official" ? -1 : 1;
  });

  for (const entry of sorted) {
    const key = entry.record.folderPath;
    if (!merged.has(key)) {
      const canonical = structuredClone(entry);
      canonical.id = stableId("record", entry.record.folderPath);
      canonical.provenance = {
        onMain: entry.source === "official",
        hasPullRequest: Boolean(entry.pr),
        listedInReadme: readmeListedFolders.has(entry.record.folderPath)
      };
      merged.set(key, canonical);
      continue;
    }

    const current = merged.get(key);
    current.provenance.onMain ||= entry.source === "official";
    current.provenance.hasPullRequest ||= Boolean(entry.pr);
    current.provenance.listedInReadme = readmeListedFolders.has(entry.record.folderPath);
    current.pr = preferredPr(current.pr, entry.pr);
    current.links.pr = current.pr?.htmlUrl || null;

    if (entry.source === "official") {
      current.source = "official";
      current.submission = entry.submission;
      current.metrics = entry.metrics;
      current.artifact = entry.artifact;
      current.links = {
        ...entry.links,
        pr: current.pr?.htmlUrl || null
      };
    }
  }

  return [...merged.values()].map((entry) => {
    entry.source = entry.provenance.onMain ? "official" : "pull_request";
    if (entry.provenance.onMain) {
      entry.status = "official";
    } else if (entry.pr?.state === "open") {
      entry.status = "open";
    } else if (entry.pr?.mergedAt) {
      entry.status = "merged";
    } else {
      entry.status = "closed";
    }
    entry.links.officialLeaderboard = "https://github.com/openai/parameter-golf#leaderboard";
    return entry;
  });
}

function compareByScoreThenDate(a, b) {
  const scoreA = scoreOrInfinity(a.metrics.valBpb);
  const scoreB = scoreOrInfinity(b.metrics.valBpb);
  if (scoreA !== scoreB) {
    return scoreA - scoreB;
  }
  const dateA = a.submission.date || "";
  const dateB = b.submission.date || "";
  return dateB.localeCompare(dateA);
}

function summarize(submissions, report) {
  const official = submissions.filter((entry) => entry.provenance.onMain);
  const openPr = submissions.filter((entry) => entry.status === "open");
  const mergedPr = submissions.filter((entry) => entry.status === "merged");
  const closedPr = submissions.filter((entry) => entry.status === "closed");
  const prBacked = submissions.filter((entry) => entry.provenance.hasPullRequest);
  const readmeListed = submissions.filter((entry) => entry.provenance.listedInReadme);
  const officialMain = official.filter((entry) => entry.category === "main-track").sort(compareByScoreThenDate);
  const openMain = openPr.filter((entry) => entry.category === "main-track").sort(compareByScoreThenDate);
  const officialNonRecord = official.filter((entry) => entry.category === "non-record").sort(compareByScoreThenDate);
  return {
    generatedAt: new Date().toISOString(),
    sourceRepo: SOURCE_REPO,
    sourceRoot: `https://github.com/${SOURCE_REPO}`,
    counts: {
      submissions: submissions.length,
      official: official.length,
      openPr: openPr.length,
      mergedPr: mergedPr.length,
      closedPr: closedPr.length,
      prBacked: prBacked.length,
      readmeListed: readmeListed.length,
      collectorErrors: report.errors.length
    },
    best: {
      officialMainTrack: officialMain[0] || null,
      openPrMainTrack: openMain[0] || null,
      officialNonRecord: officialNonRecord[0] || null
    }
  };
}

async function collectMainRecords(report) {
  const treeUrl = `${API_ROOT}/repos/${SOURCE_REPO}/git/trees/main?recursive=1`;
  const { data } = await requestJson(treeUrl);
  const entries = Array.isArray(data.tree) ? data.tree : [];
  const files = entries
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path);
  const submissionPaths = files.filter(
    (filePath) => filePath.startsWith("records/") && filePath.endsWith("/submission.json")
  );
  const submissions = [];
  for (const submissionPath of submissionPaths) {
    try {
      const contentsUrl = `${API_ROOT}/repos/${SOURCE_REPO}/contents/${submissionPath}?ref=main`;
      const { data: payload } = await fetchContentJson(contentsUrl);
      submissions.push(
        normalizeSubmission({
          source: "official",
          status: "official",
          submissionPath,
          payload,
          ref: "main"
        })
      );
    } catch (error) {
      report.errors.push({
        stage: "main-record",
        submissionPath,
        message: error.message
      });
    }
  }
  return submissions;
}

function statusFromPr(pr) {
  if (pr.state === "open") {
    return "open";
  }
  if (pr.merged_at) {
    return "merged";
  }
  return "closed";
}

async function collectPrSubmissions(report) {
  const pulls = await paginate(`${API_ROOT}/repos/${SOURCE_REPO}/pulls?state=all&per_page=100&sort=updated&direction=desc`);
  const submissions = [];
  for (const pr of pulls) {
    try {
      const files = await paginate(`${API_ROOT}/repos/${SOURCE_REPO}/pulls/${pr.number}/files?per_page=100`);
      const submissionFiles = files.filter(
        (file) => file.filename.startsWith("records/") && file.filename.endsWith("/submission.json")
      );
      if (submissionFiles.length === 0) {
        report.skipped.push({
          pr: pr.number,
          reason: "no-record-submission-json"
        });
        continue;
      }
      for (const file of submissionFiles) {
        try {
          const { data: payload, path: submissionPath } = await fetchContentJson(file.contents_url);
          submissions.push(
            normalizeSubmission({
              source: "pull_request",
              status: statusFromPr(pr),
              submissionPath,
              payload,
              ref: pr.head.sha,
              pr
            })
          );
        } catch (error) {
          report.errors.push({
            stage: "pull-request-file",
            pr: pr.number,
            filename: file.filename,
            message: error.message
          });
        }
      }
    } catch (error) {
      report.errors.push({
        stage: "pull-request",
        pr: pr.number,
        message: error.message
      });
    }
  }
  return submissions;
}

async function writeJson(fileName, value) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const target = path.join(OUTPUT_DIR, fileName);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function siteUrlFor(relativePath) {
  if (!SITE_ROOT) {
    return relativePath;
  }
  return `${SITE_ROOT.replace(/\/$/, "")}/${relativePath.replace(/^\//, "")}`;
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    sourceRepo: SOURCE_REPO,
    siteRoot: SITE_ROOT || null,
    tokenConfigured: Boolean(TOKEN),
    skipped: [],
    errors: []
  };

  const readmeListedFolders = await fetchReadmeListedFolders(report);
  const official = await collectMainRecords(report);
  const prSubmissions = await collectPrSubmissions(report);
  const submissions = mergeSubmissions([...official, ...prSubmissions], readmeListedFolders).sort(compareByScoreThenDate);
  const summary = summarize(submissions, report);
  const bundle = {
    generatedAt: summary.generatedAt,
    sourceRepo: SOURCE_REPO,
    sourceRoot: `https://github.com/${SOURCE_REPO}`,
    submissions
  };

  await writeJson("submissions.json", bundle);
  await writeJson("summary.json", summary);
  await writeJson("report.json", report);

  console.log(
    JSON.stringify(
      {
        output: siteUrlFor("/data/submissions.json"),
        counts: summary.counts,
        bestOfficial: summary.best.officialMainTrack?.metrics.valBpb ?? null,
        bestOpenPr: summary.best.openPrMainTrack?.metrics.valBpb ?? null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
