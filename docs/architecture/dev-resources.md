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

The number of containers is not the problem — a 16-container, two-environment setup
accounts for roughly 4 GiB. The memory goes to the **user session side**: the vite
dev servers above all, which have been seen at 5.8 GiB resident each.

## The caps

### vite dev server — `dev/with-memory-cap.sh`, wired into `ui/package.json`

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
ES_JAVA_OPTS=-Xms1g -Xmx1g
mem_limit: 2g
```

Dev and test datasets are small, so 1 GiB of heap is ample — the previous `-Xmx2g`
reserved twice that per running stack. `mem_limit` bounds the off-heap side (direct
memory, metaspace, thread stacks) so a runaway ES is killed *inside its container*
rather than contributing to a host-wide OOM.

Raise both if a workload genuinely needs it (large benchmark datasets, say) — but
raise them deliberately, and remember the multiplier is the number of environments
you have up.

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
