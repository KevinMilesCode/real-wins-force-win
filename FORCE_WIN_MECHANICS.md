# Force-Win Mechanics — What We Need for the Real-Life Version

## The core mechanic (from the vendored tool)

CFB27 has a native `SeasonGame.ForceWin` enum field (`'None' | 'Home' | 'Away'`).
Writing `'Home'` or `'Away'` on a schedule row **pre-decides that game's simmed
result in the favorite's favor without touching a single player rating**.
This is the game's own steering mechanism — the vendored tool
(`cfb27-force-win` v0.5, ArtVsTheWorld/"Ace", MIT, already ported in
`Archived/CFB27-Dynasty-Engine-Dev/app/src/engine/forceWin.ts`) uses it, and so will we.

The write is surgical: only the `ForceWin` field changes. The ported writer
validates with a before/after snapshot that nothing else on the row moved
(`HomeTeam`, `AwayTeam`, `SeasonYear`, `SeasonWeek`, `SeasonWeekType`,
`GameStatus`, `HomeScore`, `AwayScore`, `BowlGame` must be byte-identical).

## How the ratings-based tool decides (what we're replacing)

For each eligible game it computes a **disparity score** from team ratings:

- Base strength: `0.3×OVR + 0.15×OFF + 0.15×DEF + 0.4×positionComposite`
  (position composite weights QB 0.10 through DB 0.13, ST 0.05)
- Matchup advantage: passing/rushing offense vs pass/run defense + ST
- Final: `0.6×baseDiff + 0.4×matchup + homeField(±1, 0 neutral)`
- Adjustments: rivalry ×0.75 (compresses), FCS mismatch ×1.25 (when favorite
  is >5 OVR better)
- Probability curve: disparity 4.5→10%, 10→50%, 17→85%, 24→95% (0 below 4.5)
- Seeded roll per game: force the favorite iff roll < probability

**We replace ALL of this with real life.** No disparity, no curve, no RNG —
the real winner is deterministic. The planner becomes a lookup, not a lottery.

## Protections (keep these)

The vendored tool skips a game when any of these hold — all still apply:

1. Already played (`GameStatus != 'Unplayed'`) — never rewrite history
2. Already forced (`ForceWin != 'None'`) — never double-force
3. Postseason-linked (`BowlGame` ref populated) or conference-championship week
4. Either team unresolvable (missing/invalid ratings row)
5. User-controlled team involved — **open question**: still skip, or force?

New protections for the real-life version:

6. **No real-life counterpart** — dynasty matchup has no real game (fictional
   scheduling, FCS filler) → skip. Optionally fall back to ratings-based force.
7. **Real game not yet played** — only force games whose real result exists.

## Table contract

| Table | UniqueId | Fields read |
|---|---|---|
| SeasonGame | (see registry) | `HomeTeam`, `AwayTeam` (binary refs), `SeasonYear`, `SeasonWeek`, `SeasonWeekType`, `GameStatus`, `HomeScore`, `AwayScore`, `ForceWin`, `BowlGame` |
| Team | 3359508968 | `DisplayName`, `TeamIndex` (for name mapping; ratings NOT needed for real-life version) |
| SeasonInfo | 3123991521 | `CurrentWeek`, `CurrentYear` (internal season counter) |

`SeasonGame.SeasonYear` matches the internal counter (`SeasonInfo.CurrentYear`),
NOT the display year. `SeasonWeek` is 0-based. Team identity comes from
decoding the `HomeTeam`/`AwayTeam` binary refs (32-char, 15-bit tableId +
17-bit row) — the saveio layer owns this, the planner only sees team names.

## What the real-life version needs

### 1. Winners file (manual — Kevin's call, no API)
`winners.json`, updated by hand each week:

```json
{
  "season": 2026,
  "weeks": {
    "1": [
      { "matchup": "Texas @ Ohio State", "winner": "Ohio State" },
      { "matchup": "Mercer @ Alabama", "winner": "Alabama" }
    ]
  }
}
```

- `matchup` is `"AWAY @ HOME"` in the same names used in `teams.json`.
- Only completed games go in — if it's not in the file, it's not forced.
- The CLI validates: winner must be one of the two matchup teams.

### 2. Team name mapping
`teams.json`: real name → in-game `DisplayName`. FCS schools need **no entry**
(see FCS handling below). The CLI warns on winners-file names with no mapping.

### 3. Game matching
- **Both teams mapped**: pair lookup, real week within ±1 of dynasty week +
  offset 0 (verified 2026-10-10 against a real week-0 save: dynasty week N == real-life week N; week 0 holds real week 1's Thursday/Friday games, covered by the ±1 window).
- **One side generic in-game FCS** (`DisplayName` starts with `"FCS "`):
  match by **(FBS team + week)** — find the winners-file entry that week
  involving the FBS team. The real FCS school name in the file is irrelevant
  to matching; only the FBS side matters.
- **Neither side mapped / ambiguous** → skip, reported as unmatched.

Neutral-site games match on pair regardless of home/away order; the winner
is resolved by team identity, not position, so designation flips don't matter.

### 5. Pre-decided quirk rows (reset option)
A week-0 save can carry rows the game pre-decided: `GameStatus` is
`HomeWon`/`AwayWon` with `IsSimmed=true` and real-looking scores (in the
verified save: the 11-game 8/29 slate), even though the season hasn't
started. The vendored tool skips these (`status !== 'Unplayed'`), and
`ForceWin` on an already-simmed row likely no-ops in-game anyway.

With `resetPredecided` on, a matched quirk row is reverted first —
`GameStatus` → `Unplayed`, `IsSimmed` → false, all scores/quarters/OT and
`GameOfTheWeekScore` → 0 — then forced normally. This mirrors MyDynasty's
`revertPreSimulatedGame`. Only rows with `IsSimmed=true` are ever reset; a
row the user actually played is never touched. Rows with no real result are
left alone (not wiped). The writer snapshot-validates the wider field list
on reset rows; everything else on the row must be untouched.

### 5. Write path (same as vendored)
`SeasonGame.ForceWin = 'Home' | 'Away'` on matched rows only. Same safety:
dry-run preview → confirm → backup → write → snapshot-validate. All-or-
nothing per run.

## Open questions for Kevin

1. **Data source** — RESOLVED 2026-10-10 (Kevin): no real-time lookup in the
   tool; results live in a manually-maintained `winners.json` (seeded with
   402 real games for weeks 1–6 on 2026-10-10; hand-updated from there).
2. **User teams**: force their games to real results too, or always skip?
   (still open)
3. **No-match games** — RESOLVED 2026-10-10 (Kevin): leave them alone, report
   as unmatched with the reason. No ratings-based fallback.
4. **Postseason** — N/A for the week-0 single run: postseason games haven't
   been played yet, so there's nothing to force.
5. **Week mapping** — needs verification against his save at run time
   (verified `weekOffset: 0` against a real save, 2026-10-10).
