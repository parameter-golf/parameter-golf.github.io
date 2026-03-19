# PR Enrichment Rules

These rules define how remote PR enrichment should summarize upstream submissions and assign tags.

## Inputs

Each PR summary uses:

- PR title
- PR body / message
- `submission.json` metadata already collected into `docs/data/submissions.json`
- corresponding `README.md` files for submission folders in the PR

## Summary Rules

- Produce one plain-English summary sentence.
- Keep it short enough for table display.
- Focus on the core approach and what is methodologically distinctive, not the score outcome.
- Mention at most 2-3 notable ideas in the sentence.
- Assume score, loss, date, and track already appear elsewhere in the table.
- Do not center the summary on `val_bpb`, `val_loss`, artifact size, or generic challenge constraints unless they are directly part of the novelty.
- Prefer phrases like architecture choice, optimizer choice, eval strategy, quantization strategy, schedule change, or data regime over result reporting.
- If a PR contains multiple runs, summarize the shared approach or the representative winning approach rather than listing every variant.
- Avoid hype, rankings, or unsupported claims.

## Technique Tags

Allowed tags:

- `val-only`
- `sliding-window-eval`
- `quantization`
- `mixed-precision`
- `optimizer`
- `muon`
- `attention`
- `architecture`
- `depth-width`
- `positional-encoding`
- `training-schedule`
- `tokenization`
- `compression`
- `regularization`
- `evaluation`
- `non-record`

Tag rules:

- Return 1 to 4 tags.
- Prefer the most specific tags available.
- Do not invent tags outside the allowlist.
- Only emit `non-record` when the submission is explicitly on the non-record track.

## Val-Only Rules

Mark `usesValOnly = true` only when the PR or README clearly indicates the model trains entirely or primarily on validation-only data. High-confidence examples include:

- `val-only`
- `val only`
- `validation-only`
- explicit statements that the model trains on the validation shard

Do not mark `usesValOnly = true` for:

- ordinary validation loss reporting
- evaluation on validation data
- generic mentions of validation sets without training-on-validation claims

## Compatibility Rule

The frontend and derived data should keep compatibility with collector-based detection:

- `finalUsesValOnly = collectorUsesValOnly OR aiUsesValOnly`
- AI should never unset an existing collector `val-only` flag
