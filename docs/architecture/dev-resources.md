# Dev environment resource limits

## Why there are caps at all

A full dev stack is cheap; **several of them side by side on one laptop are not**,
and the way that failure lands is worse than it sounds.

When the host runs out of RAM *and* swap, the kernel's global OOM killer picks a
victim. If that victim happens to be a process living in the GNOME shell's cgroup
(a browser window, typically — Brave and Chromium put their renderers there), then
systemd applies that unit's default `OOMPolicy=stop` and **stops the whole
`org.gnome.Shell@wayland.service` unit**. The desktop session is destroyed: every
window closes, you land back at the login screen. Docker containers live in
`system.slice`, so they keep running — which makes the whole thing look like a
graphics or Docker bug rather than an out-of-memory one.

Observed on a 30 GiB / 8 GiB-swap machine, three times in a week:

```
kernel: Free swap  = 236kB
kernel: oom-kill: ... global_oom, task_memcg=.../org.gnome.Shell@wayland.service, task=brave
systemd: org.gnome.Shell@wayland.service: A process of this unit has been killed by the OOM killer.
gnome-shell: Shutting down GNOME Shell
systemd-logind: Session 2 logged out.
```

The number of containers is not the problem as such, but some containers are
heavy: before the caps below, one data-fair stack held ~4.6 GiB of RAM + swap
(ES 2.2, clamd 0.95, mongo 0.5, S3 0.35), and stacks left running for worktrees
nobody was working on held as much. The memory goes to the **user session side**: the vite
dev servers above all, which have been seen at 5.8 GiB resident each.

## The caps

### vite dev server — `df-mem-cap` (`@data-fair/lib-dev`), used by the ui pane of `.zellij.kdl`

The dev server runs inside a transient systemd user scope with `MemoryMax=4G`
(override with `DEV_MEMORY_MAX`). When it is exceeded the *cgroup* OOM killer kills
that process only: the host never reaches the global OOM path, so nothing else on
the machine is touched. Normal peak for this app is ~2 GiB, and the runaways that
prompted this were 4.3–5.8 GiB, so 4G separates the two. The wrapper no-ops where
`systemd-run` is unavailable (macOS, non-systemd), so it is safe for every contributor.

**A V8 heap limit does not work here, which is worth knowing before you reach for
one.** `NODE_OPTIONS=--max-old-space-size` was tried first and is useless for this
process, because vite's memory is mostly not V8. Measured on a 2 GiB dev server:

| component | size | share |
|---|---|---|
| `[anon:mimalloc]` — rolldown's native Rust allocator | 1758 MiB | 86% |
| V8 heap | 224 MiB | 11% |
| node binary, misc | ~75 MiB | 3% |

The V8 side is a bounded cache, not a leak: sweeping all 303 source modules three
times, forcing GC between sweeps, left retained heap at 259 → 265 → 271 MiB. It
saturates with app size and stays there. A 2 GiB old-space limit would never have
fired before the host died.

What the native side scales with is *not* transform count and *not* request
concurrency — both were tested and neither moved it (600 repeat transforms actually
shrank it; concurrency 8/24/48 left the arena count at 4). Two dev servers of the
same app with the same uptime sat at 552 MiB and 1758 MiB, the larger being the one
that had been driving real browsers through the simulations. The trigger is still
unidentified; the cap is what makes it survivable meanwhile.

### Elasticsearch — `docker-compose.yaml`

```
ES_JAVA_OPTS=-Xms64m -Xmx${ES_HEAP:-512m}
mem_limit: 2g
memswap_limit: 2g
```

Dev and test datasets are small, so 512 MiB of heap is ample. ES pre-touches its
initial heap at boot (`-XX:+AlwaysPreTouch`), so with `-Xms` equal to `-Xmx` the whole
heap is resident in every running stack even when idle: at the earlier 1g a stack's ES
sat around 1.5 GiB resident, at 512m around 1 GiB, while using ~130–165 MiB of it.
Starting the heap at 64m lets it grow on demand up to the same 512m ceiling; measured
on this image, idle 1001 → 640 MiB, after bulk indexing 20k documents plus searches and
aggregations 1079 → 722 MiB (~360 MiB saved per stack). ES only logs a warning about
resize pauses: the heap-size bootstrap check is not enforced with `single-node` discovery.

`memswap_limit` equal to `mem_limit` forbids swap — without it
docker allows as much swap again as `mem_limit`, and idle ES containers were seen
pushing 1.7 GiB each into swap. `mem_limit` bounds the off-heap side (direct memory,
metaspace, thread stacks) so a runaway ES is killed *inside its container* rather
than contributing to a host-wide OOM.

For a heavier workload (large benchmark datasets, say) set `ES_HEAP=1g` in `.env`
(df-dev never overwrites it) and recreate ES with `docker compose up -d elasticsearch` — 1g
still fits in the 2g limit. Remember the
multiplier is the number of environments you have up.

Boot is the other cost: an uncapped ES 8 spends 60–120 s of CPU in its first
30 s, peaking at 5–6 of 8 cores (enough to spin the laptop fan). `cpus: ${ES_CPUS:-2}`
caps it, and since ES sizes its thread pools, GC and JIT threads to the quota, total
boot CPU drops by about half with no slower time to green. Machine learning,
watcher, the built-in `logs-*`/`metrics-*` stack templates and deprecation indexing
are disabled because data-fair uses none of them. Measured on throwaway containers,
median of 3 (noisy host), CPU seconds 30 s after green:

| config | cold boot | restart (existing data) | time to green |
|---|---|---|---|
| previous | 104 s | 96 s | 36–37 s |
| features disabled | 87 s | 65 s | 27–30 s |
| features disabled + 2 CPUs | 45 s | 46 s | 27–29 s |

Raise `ES_CPUS` alongside `ES_HEAP` for benchmark indexing.

### MongoDB — `docker-compose.yaml`

`--wiredTigerCacheSizeGB 0.25`, the minimum. The default is half of (host RAM − 1 GiB)
*per mongod*, about 15 GiB on a 30 GiB machine, and every stack runs its own. Usage
was 0.4–0.6 GiB per stack when this was set; the cap keeps it from growing toward
that ceiling over days of uptime.

### ClamAV — `docker-compose.yaml` + `dev/resources/clamav-db/`

The official signature database costs about 0.95 GiB per clamd, nearly all of it
sitting in swap since nothing scans in between. Dev and the tests only ever scan the
EICAR test file, so clamd points at `dev/resources/clamav-db/` (`DatabaseDirectory`
via `CLAMD_CONF_DatabaseDirectory`), which holds a single EICAR body signature:
~30 MiB resident, and clamd starts in seconds. Detections report as
`Eicar-Test-Signature.UNOFFICIAL FOUND`, which the API treats like any other `FOUND`.
Real-world malware detection is therefore **not** exercised in dev or CI.

### Idle stacks — `dev/idle-stacks.sh`

The cheapest saving of all: a worktree you stopped working on leaves its whole
compose stack up, ~2.5–4.5 GiB of RAM + swap holding nothing useful.
`bash dev/idle-stacks.sh` lists every running compose project with its memory and
whether its dev API is running (listening, or its nodemon supervisor up while it boots), and the command to stop it
(`docker compose -p <project> stop` keeps the volumes; `npx --no df-dev zellij` brings it
back). Read-only, like `npx --no df-dev status`.

### MCP servers — `.mcp.json`

Each Claude Code session starts its own copy of every project MCP server, and
`npx`-launched ones cost two processes (the `npm exec` wrapper plus the server).
The Vuetify docs server was dropped from the shared `.mcp.json` for that reason;
add it to your own local config when you need it:

```bash
claude mcp add vuetify -s local -- npx @vuetify/mcp
```

Closing Claude sessions you are done with frees ~0.3–0.5 GiB each, MCP servers
included.

## If it happens anyway

Confirm the mechanism before changing anything:

```bash
journalctl -k --since "1 hour ago" | grep -E "Out of memory: Killed|Free swap"
journalctl --since "1 hour ago" | grep "killed by the OOM killer"
```

Two host-level mitigations live outside this repo, on the workstation:
`OOMPolicy=continue` on `org.gnome.Shell@wayland.service` (so an OOM-killed browser
tab no longer takes the session with it), and adding zram swap (so the pre-OOM
thrashing phase stops freezing the machine).
