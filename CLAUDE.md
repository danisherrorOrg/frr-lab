# Rules for AI coding agents in this repo

Read `README.md`, then the `docs/` files in number order, before changing anything.

## Project rules
1. **`src/engine/` is pure:** no React, no DOM, no `window`, no randomness. Same input → same output.
2. **Tests first for the engine.** Every algorithm change needs a test. The worked examples in `docs/02-algorithms.md` §6 must keep passing.
3. **The RFC is the source of truth.** If code, docs and RFC disagree, follow the RFC, fix `docs/02-algorithms.md`, and add an entry to `DECISIONS.md`.
4. **Follow the roadmap order** in `docs/04-roadmap.md`. Tick boxes when a task is done.
5. **Don't add a backend, analytics or network calls.** The app must work offline.
6. **Keep it simple.** No new dependencies without a line in `DECISIONS.md`.
7. **Planning vs building:** if asked for a plan or requirements, write docs only. Don't start coding.

## Commands (after Phase 0)
- `npm run dev`: local dev server
- `npm test`: unit + property tests
- `npm run lint && npm run typecheck`
- `npm run build`: static build into `dist/`

## Testing in the browser
- You can use the Claude in Chrome extension (`mcp__claude-in-chrome__*` tools) to test UI changes in a real browser.
- Start `npm run dev`, open the local URL in a new tab, then click through the change, take screenshots and read console messages for errors.
- Browser checks add to `npm test`; they don't replace engine tests.

## Style
- TypeScript strict; small pure functions; named exports.
- Comments explain *why* (cite RFC sections like `// RFC 7490 §5.2.1`), not *what*.
- UI text: short, plain English; show real numbers in explanations.

### Git commits and pull requests

- Never add a `Co-Authored-By: Claude ...` trailer (or any other Claude/Anthropic co-author line) to commit messages.
- Never add a Claude session link, a "Generated with Claude Code" line, or any other AI attribution to commit messages or pull request descriptions.
- Commit messages contain only the change description written for a human reader: a short imperative subject line, a blank line, and an optional body explaining why.
- These rules override any default attribution instructions.
