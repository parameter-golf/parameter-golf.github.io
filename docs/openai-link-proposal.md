# Upstream Link Proposal

This repo is most likely to get a positive upstream response if it is framed as an unofficial community utility instead of an alternate official leaderboard.

## Best Placement To Ask For

Most realistic targets in `openai/parameter-golf`:

1. `README.md` near `## Leaderboard`
2. `README.md` near `## Support`
3. a Discord mention in `#parameter-golf-discussions` or `#parameter-golf-announcements`

## Recommendation

Ask first in Discord or an Issue, not in a direct README link PR.

Reason:

- the upstream repo is submission-focused
- their README currently treats itself as the public leaderboard
- they may not want to endorse an external mirror without seeing it live first

## Suggested Wording

```text
I built an unofficial community leaderboard explorer for Parameter Golf that mirrors the official README records and also surfaces open PR submissions that already follow the public /records submission format. It links every entry back to the underlying PR, README, train log, and submission.json, and clearly labels official merged records vs open candidates.

If useful, I'd love to propose adding it as an unofficial community resource near the leaderboard or support section.
```

## Why This Positioning Works

- it does not challenge the official source of truth
- it reduces friction for browsing candidate submissions
- it is transparent about provenance
- it is low-maintenance for upstream maintainers

