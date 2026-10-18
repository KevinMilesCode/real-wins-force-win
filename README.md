# real-wins-force-win

Mirror real-life college football results in an EA SPORTS College Football 27
dynasty. The tool writes `SeasonGame.ForceWin` — the game's own
result-steering field — on schedule rows, so the real winner wins when the
game is simmed.

Deterministic: the winner comes from a `winners.json` file you maintain. No
RNG, no live lookups, no ratings changes.

> Unofficial fan tool. Not affiliated with or endorsed by EA. It edits save
> files; it makes a backup first, but use it at your own risk.

## Quick start (Windows exe)

1. Download `CFB27-ForceWin-vX.Y.Z.zip` from the
   [Releases](https://github.com/KevinMilesCode/real-wins-force-win/releases) page
   and unzip it. Keep `winners.json` and `teams.json` next to the exe.
2. **Copy your dynasty save to a safe place first** (saves live in
   `Documents\EA SPORTS College Football 27\saves`).
3. Start a new dynasty and save at **week 0 (preseason)**.
4. Run `CFB27-ForceWin.exe`, pick your save from the list (or paste a path; quotes are fine), review the preview, and
   confirm.
5. Load the save in-game and check that the forced results hold.

## Run from source

Requires Node.js 20+.

```sh
npm install
npm run dev          # interactive CLI
npm run typecheck
npm run build        # tsc -> dist/
npm run build:exe    # pkg -> release/CFB27-ForceWin.exe
```

## What a run does

Save → team map → winners file → preview → confirm → backup → write → verify.

- Reads the schedule from your save and matches it against `winners.json`.
- Previews every forced game and every skip, and writes only after you confirm.
- Copies the save to `<save>.bak-<timestamp>` before writing anything.
- Changes only `ForceWin` (plus the reset described below); a before/after
  snapshot check fails the run if any other field on a row moved.
- Re-running is idempotent. Games already played or already forced are skipped.
- Writes `forcewin-manifest.json` in the current folder as a record of the run.

## Inputs

- `winners.json` — real-life results, grouped by real week. Only completed
  games go in; anything not in the file is left to sim naturally.

  ```json
  { "matchup": "Texas @ Ohio State", "winner": "Ohio State" }
  ```

  `matchup` is `"AWAY @ HOME"` using the names in `teams.json`. FCS games list
  the real FCS school; the matcher pairs them to the in-game generic FCS team
  by (FBS team + week).
- `teams.json` — real team name → in-game `DisplayName`. FCS schools need no
  entry. Unmapped names are reported in the preview.

The bundled `winners.json` covers the 2026 season through week 7.

## Pre-decided rows

Week-0 saves can carry rows the game already simmed (`IsSimmed=true` with
scores). The tool resets those to unplayed before forcing them. Rows you
actually played are never touched. Details are in
[FORCE_WIN_MECHANICS.md](FORCE_WIN_MECHANICS.md).

## Layout

- `src/cli.ts` — interactive flow
- `src/reallife/winners.ts` — winners-file parser and validation
- `src/engine/planner.ts` — pure matching of dynasty games to real games
- `src/saveio/io.ts` — read/write `ForceWin` with snapshot validation

## Credits

Built on [`madden-franchise`](https://github.com/bep713/madden-franchise) for
save IO. The `ForceWin` writer and its safety checks are ported from the
community tool *CFB 27 Automatic Force Win* by ArtVsTheWorld ("Ace"); see
[NOTICE.md](NOTICE.md).

## License

[MIT](LICENSE)
