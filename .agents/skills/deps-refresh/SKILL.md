---
name: deps-refresh
description: Use when asked to update or upgrade dependencies, do "up to date" maintenance, run a security pass, or act on npm audit / trivy findings in a data-fair service. Manual invocation only.
disable-model-invocation: true
---

# Dependency Refresh

A routine "bring it up to date" pass on a data-fair service (npm workspaces + an alpine node docker image). The order is fixed: **measure, security, free wins, majors you can prove are safe, then a written plan for the rest.** Much of the value is in what you decline to upgrade, and why.

## Phase 1 — Measure before touching anything

Two scanners, because they see different things:

```bash
npm audit                                            # whole tree, dev included
npm audit --omit=dev                                 # what actually ships
npm outdated --workspaces --include-workspace-root
docker pull ghcr.io/data-fair/<service>:<version>    # the released image
trivy image --scanners vuln ghcr.io/data-fair/<service>:<version>
```

Trivy on the built image is not redundant with npm audit. It sees the alpine OS layer, which is usually where the criticals are, plus the npm bundled in the node base image, and it reports only what is actually shipped. npm audit sees the dev tree that never reaches production. Neither alone is a security answer.

Record the before numbers; they go in the PR.

## Phase 2 — Security first

Cheapest fix first:

1. **In range:** `npm update --workspaces --include-workspace-root`, then re-audit. This clears a surprising share of findings.
2. **Base image:** bump `FROM node:X-alpineY` to current, add `RUN apk upgrade --no-cache` so later alpine releases are picked up at build time, and delete what the runtime never uses — `/usr/local/lib/node_modules` (npm, corepack) carries its own CVEs and is not needed to run the service.
3. **No in-range fix:** replace or vendor rather than pinning around it. An unmaintained wrapper whose only sin is pinning an ancient transitive dep is often a few dozen lines you can vendor into the repo and delete the dependency.

## Phase 3 — Free wins, no advisory required

- **Dead deps.** Grep every declared dependency for a real import. Delete what nothing imports — and the ambient `.d.ts` shims and `optimizeDeps` entries that outlive them.
- **Phantom deps.** Something imported but never declared, resolving through a hoisted transitive copy. Declare it explicitly; it is a latent break.
- **Small dated packages** replaceable by a node built-in or by a dependency already in the tree.
- **`patches/`.** A `patch-package` patch often exists only because a fix was unreleased. Upgrading may let you delete the patch — check each one.

## Phase 4 — Majors, only when proven behaviour-neutral

Never take a major on the changelog alone. Install old and new side by side under aliases in the scratchpad and diff real behaviour against the repo's own fixtures:

```json
{ "dependencies": { "old": "npm:the-pkg@4.0.0", "new": "npm:the-pkg@5.0.0" } }
```

Compare outputs over `tests/resources/…`. Deep-compare with sorted keys — raw `JSON.stringify` reports key-ordering churn as a difference and will send you chasing noise.

Then check what no changelog can tell you: **does the runtime image still support it?** A library that switches driver, codec or native backend can be silently broken in alpine even though the build passes.

```bash
docker run --rm --entrypoint sh <image> -c 'ogrinfo --formats | grep -i kml'
```

Blockers found this way are the highest-value output of the whole pass.

## Phase 5 — Verify

```bash
npm run lint
bash dev/check-types-ratchet.sh          # if the repo has one, else npm run check-types
npm -w ui run check-types && npm -w ui run build
npx playwright test <only the specs covering what you touched>
docker build -t <service>:<branch> . && trivy image --scanners vuln <service>:<branch>
```

Boot-test the image, do not just build it. Run the deps whose loader changed (config, ESM conversions, native modules) inside it:

```bash
docker run --rm -w /app/api <image> node --input-type=module -e 'import config from "config"; console.log(config.get("mode"))'
```

Two traps specific to this pass:

- e2e specs run against the already-running dev server, whose module graph predates your upgrade. After changing vite plugins or anything they pull in, e2e results are stale until that server has been restarted — say so, and re-run them once it has.
- A single e2e failure under parallel load is usually a flake. Re-run it alone a few times before calling it a regression.

## Phase 6 — Report, then plan the rest

Split commits so a revert is surgical: security and base image, dead-and-replaced deps, verified majors, ui separate from api.

For every major you declined, write down **the specific blocker** — "the image ships the KML driver but not LIBKML", not "needs more work". That sentence is what saves the next session from re-deriving it. Persist it to memory or a follow-up issue, and offer the deferred list as the suggested next piece of work.

## Red flags

- Taking a major because its changelog says no breaking changes. Verify against your own fixtures.
- Trusting `npm audit fix` or the `fixAvailable` field — both will cheerfully propose a *downgrade* to an older major as the "fix".
- Adding an `overrides` entry and assuming it applied. Confirm with `npm ls <pkg>`; in an existing lockfile an override often resolves to nothing.
- Reporting "0 vulnerabilities" from npm audit alone, without scanning the image.
- Deleting a dependency because grep found no import, before checking ambient `.d.ts`, `optimizeDeps` and dynamic `import()`.
- Trusting a peer range to catch an incompatible pairing. `@data-fair/lib-vuetify` 2.4.0–2.5.0 imports `resolveTheme` from `@data-fair/lib-vue/session.js`, which only exists since lib-vue 1.29.0, yet declares `lib-vue: ^1.15.0`: `npm ci` passes, `vite build` fails with `MISSING_EXPORT`. Bump the two together (2.5.1+ declares `^1.31`), and prove a bump with a real build.
- A lockfile diff far larger than your change. Note it, and say whether it is intended drift absorption or accidental churn.
