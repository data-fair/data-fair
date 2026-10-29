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
| data-fair | authenticated: user id (API keys: their pseudo-user); anonymous: client IP | anonymous 600 req/min, 20 s ES compute/min, 500 kB/s dynamic, 8 MB/s static; user 1200 req/min, 60 s compute/min, 1 MB/s, 16 MB/s | in memory per pod (ingress hashes on the client address for stickiness); client: the user, else lib-express `ipRateLimitKey(reqIp(req))` (the forwarded IP, an IPv6 one as its /64); a request with neither fails; 429s carry `Retry-After`; the ignore secret bypasses everything until step 7 |
| `mcp` | — (the geocoding tool: identity, else forwarded IP) | none of its own; geocoder 40/s per instance, 10/s per caller | forwards its caller's IP and the forwarder secret |

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
only a trusted forwarder may set it — or declare that there is none — on someone else's behalf.**

- **Every request has a user or a client IP.** A limiter keys on the user when there is one, else
  on lib-express `reqIp(req)`, the leftmost `X-Forwarded-For` entry. A request with neither is an
  error (`reqIp` throws): a caller that is not authenticated and whose IP nobody forwarded is a
  misconfiguration, not a case to limit some other way. A pod's own address is never a client:
  throttling on it would put every caller behind that pod in one budget.
- **`reqIp(req, { optional: true })`** returns `undefined` instead of throwing when there is no
  `X-Forwarded-For`, for the places where "no client IP" is legitimate: the audit logs (a
  worker's in-cluster call with an API key logs events too) and a relay deciding what to forward.
  It still throws on a value that is not an IP. One function answers "what is the client IP"; a
  call site says whether "none" is acceptable.
- **`X-Forwarded-For` holds exactly one IP.** The edge proxy overwrites it, and the layers behind
  it pass it on unchanged. `reqIp` reads the first entry, the origin; several entries mean a layer
  appended to it (`$proxy_add_x_forwarded_for`), so that first entry may be what the client chose.
  `reqIp` still uses it, so a live deployment keeps working, and flags the environment with an
  internal error (`x-forwarded-for-several`, once per process then at most hourly) until its proxy
  is fixed. A layer that passes the client's own header through untouched cannot be detected by a
  service: that is what the check below is for.
- **The ingress** overwrites `X-Forwarded-For` with the client address and limits on it, except
  for a request carrying a valid *trusted forwarder* secret (`X-Trusted-Forwarder`):
  - with a single well-formed IP in `X-Forwarded-For`: that IP is the client, for nginx's limit
    key and for the services;
  - with none: the relay acts for no client address (an autonomous agent's planned task). nginx's
    limit key is empty — nginx does not account requests with an empty key — and no
    `X-Forwarded-For` reaches the services, which limit the request by its user.
  The secret lets its holder assert a client IP, or none, which buys nothing an attacker holding it
  could not already get by asserting a fresh IP per request; it never skips the services' own
  limits, unlike the ignore secret it replaces. The ingress strips it before proxying (services
  never see, log or relay it), and it is loaded from a Kubernetes secret.
- **Relays** (the agents service towards `mcp`, `mcp` towards the services, portals SSR) forward
  the credentials of whoever they act for, as today, and that caller's IP in `X-Forwarded-For`
  when they have one. A relay that calls through the ingress sends the forwarder secret; one that
  calls a service in-cluster (the agents service calls `mcp` on its internal URL) needs none, since
  only it can reach that address.
- Everything that reaches data-fair still goes through the ingress: no relay calls it directly, so
  a future WAF, nginx limits and the services that have no limiter of their own keep seeing all
  traffic.

With that, a relayed caller is limited exactly like a direct one: by nginx per IP, by data-fair per
user or per IP. **The `mcp` server has no general limiter of its own**: it was there because
data-fair's limits did not apply to its traffic (section 3). What it serves itself
(`/v0/servers`, `/profiles`, `tools/list`) comes from memory; every tool that costs anything is a
data-fair call, limited there. The one exception is below.

### Keys and answers

- **IPv6 clients are keyed on their /64.** A host usually controls a whole /64 and can pick a new
  address in it per request, so a per-IP limit keyed on the full address limits nothing.
  lib-express `ipRateLimitKey(ip)` returns an IPv4 address as is and an IPv6 one as its /64
  (`2001:db8:1:2::/64`, an IPv4-mapped address as its IPv4); every per-IP limiter keys on it. nginx
  does the same with a `map` on `$remote_addr`, which covers addresses whose first four groups are
  written out (no `::` inside the prefix) and keys the others per address — a known limit of doing
  it in nginx configuration alone.
- **A 429 says when to retry.** data-fair's limiter sends `Retry-After` (whole seconds, at least
  1) computed from the bucket that refused the request; nginx sends `Retry-After: 1` with its
  429s (its buckets refill continuously). RFC 6585 recommends it, and it is what lets a client —
  an agent especially — back off for the right time instead of retrying blindly.

### The geocoding tool

`geocode_address` calls IGN's Géoplateforme (`data.geopf.fr/geocodage`), not data-fair: no
downstream limit covers it, and IGN limits by source IP (50 requests per second), so an excess gets
our servers' addresses refused for everyone. The tool is limited where it calls IGN, by two buckets:

- **global**, per `mcp` instance, under IGN's limit divided by the number of replicas: the total we
  send;
- **per caller**, well under the global one, so no single caller can fill the global bucket and starve
  the others: its forwarded client IP (an IPv6 one as its /64), else its identity (a hash of its
  session cookie or API key). The IP comes first because the identity is not verified by `mcp`: a
  fresh made-up credential per call must not buy a fresh budget. A call with neither (stdio, one
  process and one caller; a relay acting for nobody's address) is charged to the global budget only.

A call that finds either bucket empty does not wait: it returns a tool error saying the geocoder is
busy and when to retry, which an agent can act on. Both are configuration
(`extraTools.geocodeAddress.limits`).

## 5. Work to reach the target

The `mcp` and agents releases ship together, with data-fair: no intermediate state between them is
supported.

1. **lib-express** — `ipRateLimitKey`, and `reqIp` gains the `optional` flag, typed by overloads: `reqIp(req)` is
   unchanged (`string`); `reqIp(req, { optional: true })` is `string | undefined`. `events-log`
   reads the IP it logs with it instead of `X-Client-IP`. A minor release.
2. **data-fair** — the limiter keys on the user, else on `ipRateLimitKey(reqIp(req))`, and answers its 429s with `Retry-After`, instead of the `request-ip`
   library (which reads `X-Client-IP` first); `request-ip` is removed. The logger's request
   context reads the IP with the optional form, the application-key log line with
   the strict one (it runs after the limiter accepted the request).
3. **agents** — a chat turn forwards the person's IP (from the socket's upgrade request) in
   `X-Forwarded-For` on its calls to site-bound MCP servers. A planned task's run has no person and
   forwards none: the `mcp` server and data-fair see the agent's identity.
4. **`mcp`** —
   - its limiter goes (`rate-limiting.ts`, `defaultLimits`, the `limiter`-based ceiling and identity
     budgets);
   - every call to a stack service carries the forwarder secret, and `X-Forwarded-For` with its
     caller's IP when it has one (`reqIp(req, { optional: true })` on its incoming request);
   - it stops sending `x-ignore-rate-limiting`;
   - `geocode_address` gets its two buckets.
5. **portals SSR** — a page render's calls forward the visitor's IP (`X-Forwarded-For`) and
   the forwarder secret instead of the ignore secret, and can reach the sites through the
   in-cluster L2 nginx (`upstreamProxyHost`, as `mcp` does) rather than back through the public
   load balancer, whose edge would overwrite the forwarded IP with the pod's.
6. **Ingress** — the rule above, at every layer that sets or trusts `X-Forwarded-For`:
   - staging3 nginx L2 (`manifests/data-fair/ingress-haproxy1/configmap-nginx.yaml`): it already
     trusts `X-Forwarded-For` from L1 and from the `mcp` pod (NetworkPolicy, `real_ip_header`); the
     limit key map changes from the ignore secret to the forwarder secret with an empty forwarded
     IP, and the secret header is stripped upstream;
   - production ingress-nginx (`koumoul/infrastructure`): custom snippet or template, since the
     controller manages `X-Forwarded-For` itself;
   - the secret in a new `trusted-forwarder` Kubernetes secret, mounted in `mcp` and the portals;
   - the /64 key map and `Retry-After` on 429s;
   - only callers whose `X-Forwarded-For` is trustworthy reach `mcp` (a NetworkPolicy: the ingress
     controllers, L2, the agents service): it forwards that header with the secret, so any other pod
     could choose its client IP, or declare none;
   - `X-Client-IP` is no longer read by anything; stop setting it.
7. **Retire the ignore secret** once no relay sends it: data-fair's configuration, the ingress maps
   and the deployments; rotate it anywhere it was really used (it sits in git in places). Separate.

Order: 1, then 2–6 released together; 7 after. simple-directory's per-IP limiters adopt
`ipRateLimitKey` at their next lib-express upgrade (a one-line change each, outside this work).

**Check each environment** (no `x-forwarded-for-several` internal errors is the first sign; this is the rest). data-fair's limiter reads `X-Client-IP` today, which the
ingress sets to the client address: a client cannot choose it. From 2 on it reads the leftmost
`X-Forwarded-For`, which a client can choose wherever a layer appends to the header instead of
overwriting it (`$proxy_add_x_forwarded_for`, as the dev nginx does). simple-directory already
relies on that entry, so it is likely fine, but confirm it per environment: a request sent with
`X-Forwarded-For: 192.0.2.1` must reach the service with the client's real address, alone.
