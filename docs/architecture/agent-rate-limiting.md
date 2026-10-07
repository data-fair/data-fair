# Rate limiting for agents and other relaying services

Status: plan agreed 2026-10-07. Section 3 is the state the `mcp` server ships with in rollout
step 3 of [agent-profiles.md](./agent-profiles.md); sections 4 and 5 are the target and the work
to reach it.

## 1. The problem

Agents reach data-fair through the `mcp` server, which relays each tool call to data-fair on the
caller's behalf. Parity between agents and every other client
([agent-profiles.md](./agent-profiles.md), and the agents service's one-server design) means an
agent must be limited exactly as its user would be when calling data-fair directly — no more, no
less. Two things prevent that today, and the portals' server-side rendering (SSR) has the same
shape:

- **The relay hides the caller's IP.** Every relayed call reaches the ingress, and data-fair, from
  the relaying pod. Anonymous agents share one bucket; nginx counts every agent as one client.
- **The relay disables limiting instead.** To avoid that shared bucket, the relays send
  `x-ignore-rate-limiting` with a shared secret, which makes data-fair skip every limit (requests,
  compute budget, bandwidth). An agent's traffic is then unlimited while its user's direct traffic
  is not.

## 2. Where limits apply today

| Layer | Key | Limits | Notes |
|---|---|---|---|
| Production ingress-nginx | `$binary_remote_addr` (real client, PROXY protocol) | per portal host: 1200 req/min, burst ×1, 8 MB/s; tileserver 120 req/min | annotations per Ingress; data-fair, `mcp`, simple-directory and the portal UI share the host's budget; no exemption |
| Staging2 haproxy (L1) → nginx (L2) | L2: `$binary_remote_addr` from `X-Forwarded-For` set by L1 | 1200 req/min, burst 1200, 200 concurrent, 16 MB/s; tileserver 120 req/min | L1 overwrites `X-Forwarded-For` with the client address; L2 exempts requests carrying the ignore secret (literal in a ConfigMap) |
| data-fair | authenticated: user id (API keys: their pseudo-user); anonymous: client IP | anonymous 600 req/min, 20 s ES compute/min, 500 kB/s dynamic, 8 MB/s static; user 1200 req/min, 60 s compute/min, 1 MB/s, 16 MB/s | in memory per pod (ingress hashes on the client address for stickiness); client IP from the `request-ip` library: `X-Client-IP` first, then the leftmost `X-Forwarded-For`; the ignore secret bypasses everything |
| `mcp` | client IP (lib-express `reqIp`: leftmost `X-Forwarded-For`) | 100 req/min | until step 3: public mode only |

The ingress also sets `X-Client-IP: $remote_addr` "to ensure proper IP rate-limiting in our
services" — which is what makes a relay's own address win in data-fair today.

## 3. Intermediate state (rollout step 3)

- The `mcp` server has no `mode` any more: one published server, every declared profile reachable;
  what a caller may do is data-fair's permissions on its identity.
- Its own limiter is always on, keyed by the caller's identity (the hash of its cookie or API key,
  already computed for editor sessions) when authenticated, by client IP otherwise.
- It still sends `x-ignore-rate-limiting` to data-fair.

Limiting is weak in this state, knowingly: agents are limited by nginx on the way in (per client
IP) and by `mcp`'s own limiter, but **data-fair's per-user and per-IP limits do not apply to agent
traffic** until section 5 lands.

## 4. Target

One rule for the whole stack: **the client IP travels in `X-Forwarded-For`, set by the ingress, and
only a trusted forwarder may set it on someone else's behalf.**

- Every rate limiter reads the client IP the same way: lib-express `reqIp`, the leftmost
  `X-Forwarded-For` entry, falling back to the socket address for in-cluster requests that carry
  none.
- The ingress overwrites `X-Forwarded-For` with the client address — it never appends to or keeps a
  value it did not set — **except** when the request carries a valid *trusted forwarder* secret: it
  then keeps the forwarded value, if it is a single well-formed IP.
- nginx's own limit key is that same resolved IP, so nginx limits the real client even for relayed
  calls.
- Relays (`mcp`, portals SSR) send the caller's IP in `X-Forwarded-For` with the forwarder secret,
  forward the caller's credentials as today, and no longer send the ignore secret. Authenticated
  callers are then limited by data-fair per user; anonymous ones per IP; everyone by nginx per IP —
  exactly as for direct traffic.
- Everything still goes through the ingress: no relay calls a service directly, so a future WAF,
  nginx limits and the services that have no limiter of their own keep seeing all traffic.

The forwarder secret lets its holder *assert a client IP*, which is far less than today's ignore
secret (*skip all limiting*). It is still a secret: the ingress strips the header before proxying
(services never see, log or relay it), it is loaded from a Kubernetes secret rather than written in a
ConfigMap, and it is distinct from the ignore secret, which disappears.

## 5. Work to reach the target

1. **lib-express** — a `reqClientIp(req)` helper: leftmost `X-Forwarded-For`, socket address when
   absent (`reqIp` throws then, which a limiter must not).
2. **data-fair** — the limiter's client id uses that helper instead of `request-ip` (which reads
   `X-Client-IP` first); same for the other services with an IP-keyed limiter (`mcp`,
   simple-directory — check each).
3. **Ingress** (`koumoul/infrastructure`):
   - stop setting `X-Client-IP`, or set it to the resolved client IP;
   - a `map` from the forwarder secret header to the resolved client IP (forwarded value when the
     secret matches and the value is a single IP, `$remote_addr` otherwise), used both for
     `X-Forwarded-For` and as the `limit_req_zone` / `limit_conn_zone` key;
   - strip the secret header upstream;
   - at every layer that sets or trusts `X-Forwarded-For`: production ingress-nginx (custom
     snippet or template, since the controller manages `X-Forwarded-For` itself), staging2 haproxy L1
     (which overwrites unconditionally today) and nginx L2;
   - the secret from a Kubernetes secret, in a new `trusted-forwarder` secret.
4. **`mcp`** — set `X-Forwarded-For` to its caller's IP (from its own incoming request) and the
   forwarder secret on every call to data-fair; stop sending `x-ignore-rate-limiting`.
5. **portals SSR** — the same as `mcp` in its local fetch.
6. **Retire the ignore secret** once no relay sends it: remove it from data-fair's configuration,
   the ingress maps and the deployments. A caller that is truly internal with no caller to
   represent (if one appears) gets an explicit, separately named exemption.

Order: 1 and 2 can ship first (they change nothing while the ingress still overwrites); 3 next;
then 4 and 5 together with removing the ignore header from each relay; 6 last.
