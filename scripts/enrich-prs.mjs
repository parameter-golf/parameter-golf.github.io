import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const OWNER = "openai";
const REPO = "parameter-golf";
const SOURCE_REPO = `${OWNER}/${REPO}`;
const API_ROOT = "https://api.github.com";
const OUTPUT_DIR = path.resolve("docs/data");
const ENRICHMENT_DIR = path.join(OUTPUT_DIR, "pr-enrichment");
const ENRICHMENT_ITEMS_DIR = path.join(ENRICHMENT_DIR, "items");
const INDEX_PATH = path.join(ENRICHMENT_DIR, "index.json");
const STATE_PATH = path.resolve(".cache/pr-enrichment-state.json");
const STATE_VERSION = 1;
const PROMPT_VERSION = "2026-03-20-pr-enrichment-v1";
const MODEL = process.env.PR_ENRICH_MODEL || "gpt-5.1-codex-mini";
const CLI_PROXY_BASE_URL = process.env.CLIPROXY_BASE_URL || process.env.OPENAI_BASE_URL || "http://100.81.203.52:8317";
const CLI_PROXY_API_KEY = process.env.CLIPROXY_API_KEY || readOptionalText("/opt/cliproxyapi/API_KEY.txt");
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || readGhToken();
const FETCH_HEADERS = {
  "Accept": "application/vnd.github+json",
  "User-Agent": "parameter-golf-pr-enrichment",
  ...(TOKEN ? { "Authorization": `Bearer ${TOKEN}` } : {})
};
const TAG_ALLOWLIST = [
  "val-only",
  "sliding-window-eval",
  "quantization",
  "mixed-precision",
  "optimizer",
  "muon",
  "attention",
  "architecture",
  "depth-width",
  "positional-encoding",
  "training-schedule",
  "tokenization",
  "compression",
  "regularization",
  "evaluation",
  "non-record"
];

function readOptionalText(filePath) {
  try {
    return execFileSync("bash", ["-lc", `cat ${shellQuote(filePath)}`], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function readGhToken() {
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...FETCH_HEADERS,
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${url}: ${body.slice(0, 400)}`);
  }
  return response.json();
}

async function requestText(url, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 400)}`);
  }
  return response.text();
}

async function loadJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function truncateText(value, maxLength) {
  if (!value) {
    return "";
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n...[truncated]`;
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function createEmptyState() {
  return {
    version: STATE_VERSION,
    sourceRepo: SOURCE_REPO,
    promptVersion: PROMPT_VERSION,
    generatedAt: null,
    prs: {}
  };
}

function groupPrEntries(submissionsBundle) {
  const grouped = new Map();
  for (const entry of submissionsBundle.submissions || []) {
    if (!entry?.pr?.number) {
      continue;
    }
    const key = String(entry.pr.number);
    if (!grouped.has(key)) {
      grouped.set(key, {
        prNumber: entry.pr.number,
        pr: entry.pr,
        entries: []
      });
    }
    grouped.get(key).entries.push(entry);
  }
  return [...grouped.values()].sort((a, b) => b.pr.number - a.pr.number);
}

function shouldEnrich(group, stateEntry, itemPathExists) {
  const signature = `${PROMPT_VERSION}:${group.pr.headSha}:${group.pr.state}:${group.pr.updatedAt || ""}`;
  if (!stateEntry) {
    return { needed: true, signature };
  }
  if (!itemPathExists) {
    return { needed: true, signature };
  }
  return { needed: stateEntry.signature !== signature, signature };
}

function buildReadmeApiUrl(entry) {
  return `${API_ROOT}/repos/${SOURCE_REPO}/contents/${entry.record.readmePath}?ref=${entry.pr.headSha}`;
}

async function fetchReadmeText(entry) {
  const data = await requestJson(buildReadmeApiUrl(entry));
  if (typeof data.content !== "string") {
    throw new Error(`No README content for PR ${entry.pr.number}`);
  }
  return Buffer.from(data.content, "base64").toString("utf8");
}

async function fetchPullRequest(prNumber) {
  return requestJson(`${API_ROOT}/repos/${SOURCE_REPO}/pulls/${prNumber}`);
}

function normalizeTags(tags, fallbackNonRecord) {
  const seen = new Set();
  const normalized = [];
  for (const rawTag of Array.isArray(tags) ? tags : []) {
    const tag = String(rawTag || "").trim();
    if (!TAG_ALLOWLIST.includes(tag) || seen.has(tag)) {
      continue;
    }
    normalized.push(tag);
    seen.add(tag);
  }
  if (fallbackNonRecord && !seen.has("non-record")) {
    normalized.push("non-record");
  }
  return normalized.slice(0, 4);
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error("Model response did not contain a JSON object.");
}

async function callModel(messages) {
  if (!CLI_PROXY_API_KEY) {
    throw new Error("CLIPROXY_API_KEY is not configured.");
  }
  const response = await fetch(`${CLI_PROXY_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CLI_PROXY_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CLIProxy ${response.status}: ${body.slice(0, 500)}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Model returned empty content.");
  }
  return JSON.parse(extractJsonObject(content));
}

function buildPromptPayload(group, pr, readmes) {
  return {
    pr: {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: pr.draft,
      mergedAt: textOrNull(pr.merged_at),
      updatedAt: textOrNull(pr.updated_at),
      body: textOrNull(pr.body)
    },
    submissions: group.entries.map((entry) => ({
      name: entry.submission.name,
      author: entry.submission.author,
      githubId: entry.submission.githubId,
      blurb: entry.submission.blurb,
      status: entry.status,
      category: entry.category,
      track: entry.track.label,
      metrics: entry.metrics
    })),
    readmes: readmes.map((item) => ({
      path: item.path,
      text: truncateText(item.text, 6000)
    }))
  };
}

function buildMessages(payload) {
  return [
    {
      role: "system",
      content: [
        "You summarize OpenAI Parameter Golf PRs for a public leaderboard viewer.",
        "Return JSON only with keys: summary, tags, usesValOnly, valOnlyReasoning, techniques.",
        "summary must be one plain-English sentence, under 160 characters when possible.",
        `tags must be an array of 1 to 4 items chosen only from: ${TAG_ALLOWLIST.join(", ")}.`,
        "usesValOnly should be true only for explicit validation-shard training or val-only training.",
        "Do not mark usesValOnly true for normal validation evaluation or validation loss reporting.",
        "techniques should be 1 to 3 short bullet-like phrases.",
        "Avoid hype and unsupported claims."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify(payload)
    }
  ];
}

function buildCompatibility(group, aiUsesValOnly) {
  const collectorUsesValOnly = group.entries.some((entry) => entry.flags?.usesValOnly);
  const finalUsesValOnly = collectorUsesValOnly || aiUsesValOnly;
  return {
    collectorUsesValOnly,
    aiUsesValOnly,
    finalUsesValOnly,
    valOnlyMatchesCollector: collectorUsesValOnly === aiUsesValOnly
  };
}

function buildFinalTags(rawTags, fallbackNonRecord, finalUsesValOnly) {
  const tags = normalizeTags(rawTags, fallbackNonRecord);
  if (finalUsesValOnly && !tags.includes("val-only")) {
    tags.unshift("val-only");
  }
  return tags.slice(0, 4);
}

function canonicalizeItem(item) {
  if (!item?.pr?.number || !item?.compatibility || !item?.output) {
    return item;
  }
  const nextTags = buildFinalTags(
    item.output.tags,
    item.output.tags?.includes?.("non-record"),
    Boolean(item.compatibility.finalUsesValOnly)
  );
  if (JSON.stringify(nextTags) === JSON.stringify(item.output.tags || [])) {
    return item;
  }
  return {
    ...item,
    output: {
      ...item.output,
      tags: nextTags
    }
  };
}

async function enrichGroup(group) {
  const pr = await fetchPullRequest(group.prNumber);
  const readmes = [];
  for (const entry of group.entries) {
    try {
      readmes.push({
        path: entry.record.readmePath,
        text: await fetchReadmeText(entry)
      });
    } catch {
      // Missing or unreadable README is allowed; the PR body and submission metadata are still useful.
    }
  }
  const payload = buildPromptPayload(group, pr, readmes);
  const modelOutput = await callModel(buildMessages(payload));
  const compatibility = buildCompatibility(group, Boolean(modelOutput.usesValOnly));
  const tags = buildFinalTags(
    modelOutput.tags,
    group.entries.some((entry) => entry.category === "non-record"),
    compatibility.finalUsesValOnly
  );
  return {
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    model: MODEL,
    pr: {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      updatedAt: textOrNull(pr.updated_at),
      headSha: pr.head.sha,
      htmlUrl: pr.html_url,
      authorLogin: textOrNull(pr.user?.login)
    },
    inputs: {
      hash: sha256(stableJson(payload)),
      readmePaths: readmes.map((item) => item.path),
      submissionCount: group.entries.length
    },
    output: {
      summary: String(modelOutput.summary || "").trim(),
      tags,
      usesValOnly: compatibility.aiUsesValOnly,
      valOnlyReasoning: String(modelOutput.valOnlyReasoning || "").trim(),
      techniques: Array.isArray(modelOutput.techniques)
        ? modelOutput.techniques.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
        : []
    },
    compatibility
  };
}

function buildIndexEntry(item) {
  return {
    prNumber: item.pr.number,
    title: item.pr.title,
    status: item.pr.state,
    updatedAt: item.pr.updatedAt,
    headSha: item.pr.headSha,
    generatedAt: item.generatedAt,
    summary: item.output.summary,
    tags: item.output.tags,
    flags: {
      usesValOnly: item.compatibility.finalUsesValOnly,
      usesValOnlyAi: item.compatibility.aiUsesValOnly,
      usesValOnlyCollector: item.compatibility.collectorUsesValOnly
    },
    compatibility: {
      valOnlyMatchesCollector: item.compatibility.valOnlyMatchesCollector
    },
    file: `items/pr-${item.pr.number}.json`
  };
}

async function main() {
  const submissionsBundle = await loadJson(path.join(OUTPUT_DIR, "submissions.json"), null);
  if (!submissionsBundle) {
    throw new Error("docs/data/submissions.json does not exist. Run the collector first.");
  }
  const previousState = await loadJson(STATE_PATH, createEmptyState());
  const previousIndex = await loadJson(INDEX_PATH, {
    generatedAt: null,
    sourceRepo: SOURCE_REPO,
    promptVersion: PROMPT_VERSION,
    entries: []
  });
  const previousIndexMap = new Map((previousIndex.entries || []).map((entry) => [String(entry.prNumber), entry]));
  const nextState = createEmptyState();
  const nextEntries = [];
  const changed = [];

  for (const group of groupPrEntries(submissionsBundle)) {
    const itemPath = path.join(ENRICHMENT_ITEMS_DIR, `pr-${group.prNumber}.json`);
    const stateEntry = previousState.prs?.[String(group.prNumber)] || null;
    const { needed, signature } = shouldEnrich(group, stateEntry, await fileExists(itemPath));

    let item;
    if (needed) {
      item = canonicalizeItem(await enrichGroup(group));
      await writeJson(itemPath, item);
      changed.push(group.prNumber);
    } else {
      const previousItem = await loadJson(itemPath, null);
      item = canonicalizeItem(previousItem);
      if (!item) {
        item = canonicalizeItem(await enrichGroup(group));
        await writeJson(itemPath, item);
        changed.push(group.prNumber);
      } else if (JSON.stringify(item.output?.tags || []) !== JSON.stringify(previousItem?.output?.tags || [])) {
        await writeJson(itemPath, item);
        changed.push(group.prNumber);
      }
    }

    const file = `items/pr-${group.prNumber}.json`;
    const indexEntry = buildIndexEntry(item);
    nextEntries.push(indexEntry);
    nextState.prs[String(group.prNumber)] = {
      signature,
      file,
      updatedAt: group.pr.updatedAt || null,
      headSha: group.pr.headSha
    };
    previousIndexMap.delete(String(group.prNumber));
  }

  const removedPrs = Object.keys(previousState.prs || {}).filter(
    (prNumber) => !nextState.prs[prNumber]
  );

  if (changed.length === 0 && removedPrs.length === 0) {
    console.log(JSON.stringify({
      sourceRepo: SOURCE_REPO,
      promptVersion: PROMPT_VERSION,
      model: MODEL,
      totalPrs: nextEntries.length,
      changedPrs: changed
    }, null, 2));
    return;
  }

  nextState.generatedAt = new Date().toISOString();
  const nextIndex = {
    generatedAt: new Date().toISOString(),
    sourceRepo: SOURCE_REPO,
    promptVersion: PROMPT_VERSION,
    entries: nextEntries.sort((a, b) => b.prNumber - a.prNumber)
  };

  await writeJson(INDEX_PATH, nextIndex);
  await writeJson(STATE_PATH, nextState);

  console.log(JSON.stringify({
    sourceRepo: SOURCE_REPO,
    promptVersion: PROMPT_VERSION,
    model: MODEL,
    totalPrs: nextEntries.length,
    changedPrs: changed
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
