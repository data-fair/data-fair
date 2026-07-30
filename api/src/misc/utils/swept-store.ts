/**
 * Keyed store of per-client limiter state, swept after an idle delay. Entries carry their own
 * `lastUsed`; getOrCreate stamps it on creation AND on every access (an entry created without a
 * timestamp was the historical sweep bug — `undefined < threshold` is always false, so it leaked
 * forever), and holders may keep touching it directly while they use an entry across a long
 * stream (the bandwidth Throttle does, per chunk) so active entries survive the sweep.
 * The optional `isValid` predicate recreates entries whose configured parameters changed at
 * runtime (tests tweak limits on the fly).
 */
export class SweptStore<T extends { lastUsed: number }> {
  private entries: Record<string, T> = {}

  getOrCreate (key: string, factory: () => T, isValid?: (entry: T) => boolean): T {
    let entry = this.entries[key]
    if (!entry || (isValid && !isValid(entry))) entry = this.entries[key] = factory()
    entry.lastUsed = Date.now()
    return entry
  }

  sweep (maxIdleMs: number, now = Date.now()): void {
    for (const key of Object.keys(this.entries)) {
      if (this.entries[key].lastUsed < now - maxIdleMs) delete this.entries[key]
    }
  }

  clear (): void {
    this.entries = {}
  }
}
