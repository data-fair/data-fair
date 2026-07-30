/**
 * Minimal continuous-drip token bucket, in the style of its sibling ComputeBucket (config-free,
 * injectable clock, plain fields). Replaces both `limiter` classes: request counting uses
 * capacity = allowed requests per window and refillPerSecond = capacity / window-seconds;
 * bandwidth throttling uses capacity = bandwidth * burstFactor and refillPerSecond = bandwidth.
 * Starts FULL — the capacity is a burst allowance meant to be immediately usable (the `limiter`
 * lib's TokenBucket dripped up from 0, so fresh clients never actually had their burst).
 */
export class TokenBucket {
  capacity: number
  refillPerSecond: number
  content: number
  private lastDrip: number

  constructor (capacity: number, refillPerSecond: number, now = Date.now()) {
    this.capacity = capacity
    this.refillPerSecond = refillPerSecond
    this.content = capacity
    this.lastDrip = now
  }

  private drip (now: number) {
    if (now <= this.lastDrip) return
    this.content = Math.min(this.capacity, this.content + (now - this.lastDrip) * this.refillPerSecond / 1000)
    this.lastDrip = now
  }

  /** Take `count` tokens if available. A count above capacity can never be granted. */
  tryTake (count: number, now = Date.now()): boolean {
    this.drip(now)
    if (count > this.content) return false
    this.content -= count
    return true
  }

  /** Ms until `count` tokens will have dripped in — 0 if already there, Infinity if count > capacity. */
  msUntil (count: number, now = Date.now()): number {
    if (count > this.capacity) return Infinity
    this.drip(now)
    if (count <= this.content) return 0
    return Math.ceil((count - this.content) * 1000 / this.refillPerSecond)
  }
}
