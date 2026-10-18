# CLAUDE.md — real-wins-force-win

Router, not a manual. Read this, then the README or FORCE_WIN_MECHANICS.md the
task points to. `README.md` covers run steps and inputs; `FORCE_WIN_MECHANICS.md`
covers the game field and matching rules.

## What this is

A CLI that mirrors real-life college football results into a CFB27 dynasty by
writing `SeasonGame.ForceWin` ('Home' / 'Away') on schedule rows. The real
winner from `winners.json` is the winner. No RNG, no live lookups, no ratings.
Ported from the vendored `cfb27-force-win` writer; the original ratings-based
logic in `Archived/CFB27-Dynasty-Engine-Dev` is reference only, not replaced code.

## Commands

```bash
npm install
npm run dev          # interactive CLI (tsx src/cli.ts)
npm run typecheck
npm run build        # tsc -> dist/
npm run build:exe    # pkg -> release/CFB27-ForceWin.exe
```

## Safety rules (from the shared working agreements)

- **Never overwrite an original save.** The writer makes a backup first; keep it
  that way. Do not add a write path that skips the backup.
- **Real saves live at `C:\Users\kevin\Documents\EA SPORTS College Football 27\saves`.**
  Do not alter existing files there. Copy out to test.
- **Preview and confirm before any write.** The CLI already previews and asks;
  do not remove those prompts.
- **In-game load is the only real pass.** "The verify step passed" is not "the
  game accepts it."
- **Resolve tables by `uniqueId`, never by name or index** in anything that mutates
  a save. Field facts live in the knowledge repo, not here.

## Where things live

- `src/cli.ts` — save → team map → winners file → preview → confirm → write → verify
- `src/reallife/` — winners-file parser
- `src/engine/planner.ts` — pure matching of dynasty games to real games
- `src/saveio/io.ts` — read/write ForceWin with snapshot validation
- Shared facts: `G:\Tools\EA Sports\Development\CFB\CFB27-Modding-Knowledge\INDEX.md`
- Process rules: `G:\Tools\EA Sports\Development\CFB\CFB27-Ways-Of-Working\WORKING_AGREEMENTS.md`

## Git

- Every commit is authored by Kevin. No AI `Co-Authored-By` trailer.
- Remote: `origin` → `github.com/KevinMilesCode/real-wins-force-win` (private).
  Check `git remote -v` before pushing anything.
