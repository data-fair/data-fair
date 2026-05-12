/**
 * Time-weighted ("compute budget") rate limiting bucket: holds `budgetMs` milliseconds of allowed
 * Elasticsearch work per `windowMs`, refilled continuously. Unlike a request-count bucket it bills the
 * *cost* of requests (the wall-clock time their ES queries took), so a heavy consumer trips it far
 * sooner than a cheap one, and it self-adapts when the cluster slows down (every query then bills more,
 * budgets drain faster, fewer queries are admitted, the cluster recovers).
 *
 * The bucket may go negative — floored at `-budgetMs` — so a single over-budget query imposes a
 * cool-down of up to one window before the client is served again. (Without a negative floor, a huge
 * query would only empty the bucket to zero, which refills almost immediately and leaves no lasting
 * effect on a sequential heavy stream.) See docs/architecture/load-management.md.
 *
 * In-memory / per-process — same caveats as the request-count limiter (`rate-limiting.ts`): correctness
 * across replicas relies on the reverse proxy hashing by client IP. `now` is injectable for tests;
 * production callers use the default `Date.now()`.
 */
export class ComputeBucket {
  budgetMs: number
  windowMs: number
  content: number
  lastDrip: number
  lastUsed: number

  constructor (budgetMs: number, windowMs: number, now = Date.now()) {
    this.budgetMs = budgetMs
    this.windowMs = windowMs
    this.content = budgetMs
    this.lastDrip = now
    this.lastUsed = now
  }

  private drip (now: number) {
    if (now <= this.lastDrip) return
    this.content = Math.min(this.budgetMs, this.content + (now - this.lastDrip) * this.budgetMs / this.windowMs)
    this.lastDrip = now
  }

  hasBudget (now = Date.now()): boolean {
    this.drip(now)
    this.lastUsed = now
    return this.content > 0
  }

  debit (ms: number, now = Date.now()): void {
    this.drip(now)
    this.content = Math.max(-this.budgetMs, this.content - Math.max(0, ms))
    this.lastUsed = now
  }
}
