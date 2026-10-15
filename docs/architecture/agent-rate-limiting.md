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
- Its own limiter is always on, for every caller (in-cluster ones included), keyed by the caller's
  claimed identity (a hash of its `id_token` session cookie or of its API key) when it has one, by
  client IP otherwise — and always under a per-IP ceiling of ten times the per-caller budget, since
  the identity is not verified there: made-up identities cannot buy more than the ceiling.
- It still sends `x-ignore-rate-limiting` to data-fair.

Limiting is weak in this state, knowingly: agents are limited by nginx on the way in (per client
IP) and by `mcp`'s own limiter, but **data-fair's per-user and per-IP limits do not apply to agent
traffic** until section 5 lands.

## 4. Target

One rule for the whole stack: **the client IP travels in `X-Forwarded-For`, set by the ingress, and
only a trusted forwarder may set it on someone else's behalf.**

- Every rate limiter reads the client IP the same way: lib-express `reqIp(req, { optional: true })`,
  the leftmost `X-Forwarded-For` entry. An in-cluster request (one that did not come through the
  reverse proxy: no `X-Forwarded-Host`) has **no** client IP: its socket address is a pod's, and
  throttling on it would put every caller behind that pod in one budget. The limiter then limits
  the request by its user when it has one, and not by IP otherwise; an in-cluster caller that acts
  for someone forwards that someone's IP instead. A request that came through the proxy without
  `X-Forwarded-For` is a misconfigured proxy and fails, rather than silently escaping IP limits.
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

1. **lib-express** — `reqIp` gains an `optional` flag, typed by overloads: `reqIp(req)` is
   unchanged (`string`, throws without the header); `reqIp(req, { optional: true })` returns
   `string | undefined`, `undefined` for an in-cluster request without `X-Forwarded-For`, and still
   throws for a proxied one without it or for a value that is not an IP. No second helper: one
   function answers "what is the client IP", and a call site says whether "none" is acceptable.
   `events-log` reads the IP it logs the same way instead of `X-Client-IP`.
2. **data-fair** — the limiter's client id is the user, else `reqIp(req, { optional: true })`,
   instead of the `request-ip` library (which reads `X-Client-IP` first); with neither, the
   request is not limited (in-cluster and anonymous). The audit-log context
   (`reqEventLogContext`) and the application-key log line read the IP the same way, and
   `request-ip` is removed. **mcp** — its inline fallback to the socket address becomes
   `reqIp(req, { optional: true })`: no per-IP ceiling without a client IP, the per-identity
   budget unchanged, and no limit for an in-cluster caller with neither. Other services with an
   IP-keyed limiter keep strict `reqIp` while all their traffic comes through the proxy
   (simple-directory, agents, backup).
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

Order: 1 and 2 can ship first (they change nothing while the ingress still overwrites — check that
it does, see below); 3 next;
then 4 and 5 together with removing the ignore header from each relay; 6 last.

**Check before step 2 reaches production.** data-fair's limiter reads `X-Client-IP` today, which
the ingress sets to `$remote_addr`: a client cannot choose it. After step 2 it reads the leftmost
`X-Forwarded-For`, which a client can choose wherever a layer appends to the header instead of
overwriting it (`$proxy_add_x_forwarded_for`, as the dev nginx does), and an anonymous client could
then pick a fresh IP per request. simple-directory already relies on that entry, so this is likely
fine, but confirm it per environment first: a request sent with `X-Forwarded-For: 192.0.2.1` must
reach the service with the client's real address leftmost.

**The agents service is a relay too.** It calls `mcp` in-cluster (no `X-Forwarded-Host`), so after
step 2 `mcp` sees no client IP for it: an authenticated agent keeps its per-identity budget, an
anonymous one (a personal assistant on `catalog` for a visitor) is not limited by `mcp` at all.
Forwarding the person's IP from the agents service to `mcp` (`X-Forwarded-For`) belongs with step 4.
