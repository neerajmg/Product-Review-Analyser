# Contributing & Version Control Workflow

This project follows a lightweight, review-friendly workflow optimized for small, safe commits and easy rollback.

## Branching

- `main`: Stable, deployable at all times.
- Feature branches: `feat/<short-description>` for new functionality.
- Fix branches: `fix/<issue-or-bug>`.
- Chore/maintenance: `chore/<task>`.

## Commit Granularity

Aim for *one logical change per commit* (e.g., “add consent modal”, “add retry/backoff”, “add key health monitoring”).

Recommended frequency: commit after every cohesive chunk that:

- Adds a new file or feature slice
- Refactors a module
- Fixes a defect
- Updates docs or tests meaningfully

Avoid mixing unrelated concerns in one commit.

## Conventional Commit Style

Use one of:

- `feat:` new user-facing feature
- `fix:` bug fix
- `chore:` maintenance (deps, formatting, scaffold)
- `docs:` documentation-only changes
- `refactor:` non-behavioral code restructuring
- `test:` adding or adjusting tests
- `perf:` performance improvements

Examples:

```text
feat: add deep crawl consent modal with robots.txt check
fix: correct rating extraction for partial decimal strings
docs: expand README with key validation steps
```

## Commit Message Template

First line (max ~72 chars) = type + scope + summary.
Optional body paragraphs:

1. Motivation / why
2. Implementation notes
3. Any follow-up TODOs (if small)

No trailing periods on the subject line.

## Versioning

Semantic versioning intent (manually managed for now):

- PATCH: internal fixes, no new features.
- MINOR: new backwards-compatible features.
- MAJOR: breaking changes (not expected early on).

Tag releases when a cohesive feature milestone is reached:

```bash
git tag -a v0.1.0 -m "Initial scaffold with deep crawl framework"
git push origin v0.1.0
```

## Regular Push Strategy

1. Commit locally every small logical change.
2. Run quick manual smoke (extension reload + analyze test page).
3. Push at least every few commits or before context switching:

```bash
git push origin <branch>
```

1. Open a Pull Request (if using feature branches) → review → squash or merge.

## Rollback / Recovery

| Scenario                                 | Command                      |
| ---------------------------------------- | ---------------------------- |
| Undo last unpushed commit (keep changes) | `git reset --soft HEAD~1`  |
| Undo last unpushed commit (discard)      | `git reset --hard HEAD~1`  |
| Revert a pushed commit                   | `git revert <commit-hash>` |
| Create a safety branch before rewriting  | `git branch backup/<date>` |

Never force-push to `main` unless absolutely necessary (and only after making a backup branch).

## Suggested Daily Flow

1. `git pull --ff-only` (stay up to date)
2. Implement small change
3. `git add -p` (stage only what belongs)
4. ` git commit -m "feat: ..."`
5. Test: reload extension & quick functional check
6. `git push`
7. Repeat

## Tests

- Add unit or DOM snippet tests in `tests/` for selectors, parsing, or summarizer logic.
- For future: add automated schema validation test for Gemini output.

## TODO Backlog (High-Level)

- Strict JSON schema validation of model output.
- Deterministic sampling strategy for large review sets.
- More robust CAPTCHA pattern library.
- UI accessibility pass (ARIA roles).

---

Questions or unsure how to scope a commit? Start small—short, clean commits are always easier to review and revert.
