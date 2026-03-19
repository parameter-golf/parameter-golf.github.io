# Data Schema

The collector generates three public JSON files:

## `docs/data/submissions.json`

Top-level shape:

```json
{
  "generatedAt": "2026-03-19T12:00:00.000Z",
  "sourceRepo": "openai/parameter-golf",
  "submissions": []
}
```

Each submission contains:

```json
{
  "id": "pr-53-records-track_10min_16mb-2026-03-19_SP4096_SlidingWindowEval",
  "source": "pull_request",
  "status": "open",
  "category": "main-track",
  "track": {
    "path": "records/track_10min_16mb",
    "slug": "track_10min_16mb",
    "label": "10 Minute / 16MB",
    "official": true
  },
  "record": {
    "folderName": "2026-03-19_SP4096_SlidingWindowEval",
    "folderPath": "records/track_10min_16mb/2026-03-19_SP4096_SlidingWindowEval",
    "submissionPath": "records/track_10min_16mb/2026-03-19_SP4096_SlidingWindowEval/submission.json",
    "readmePath": "records/track_10min_16mb/2026-03-19_SP4096_SlidingWindowEval/README.md",
    "trainLogPath": "records/track_10min_16mb/2026-03-19_SP4096_SlidingWindowEval/train.log",
    "scriptPath": "records/track_10min_16mb/2026-03-19_SP4096_SlidingWindowEval/train_gpt.py"
  },
  "submission": {
    "author": "Kshitiz",
    "githubId": "kshitizz36",
    "name": "SP-4096 + Sliding Window Eval",
    "blurb": "…",
    "date": "2026-03-19T12:00:00Z"
  },
  "metrics": {
    "valBpb": 1.18883084,
    "valLoss": 2.73510678,
    "preQuantValBpb": 1.2067,
    "preQuantValLoss": 2.7763,
    "stepStop": 14006,
    "wallclockSeconds": 600.062,
    "evalTimeSeconds": 52.977
  },
  "artifact": {
    "bytesTotal": 15683958,
    "bytesCode": 54244,
    "bytesModelInt8Zlib": 15629714
  },
  "pr": {
    "number": 53,
    "title": "1.1888 BPB via SP-4096 compression + stride-64 sliding window",
    "state": "open",
    "draft": false,
    "mergedAt": null,
    "htmlUrl": "https://github.com/openai/parameter-golf/pull/53",
    "headSha": "613531358ceb7f343e08b5a36b369b2c5b5c011a",
    "headRepo": "kshitizz36/parameter-golf"
  },
  "links": {
    "submissionJson": "…",
    "readme": "…",
    "trainLog": "…",
    "script": "…",
    "pr": "…",
    "folder": "…"
  }
}
```

## `docs/data/summary.json`

Aggregated counts and best scores for site headers and quick stats.

## `docs/data/report.json`

Collector diagnostics, including skipped PRs and parse failures.

