#!/bin/sh
# The dev API's run command, invoked by nodemon — see api/package.json.
#
# It exists so that retry-on-crash cannot fire when nodemon kills us on an
# ordinary restart.
#
# nodemon runs its --exec string through `sh -c` and, on a restart, signals the
# whole process subtree. The shell usually sees `node` die first and runs the
# next command before its own signal lands, so the inline
# `node … || (sleep 2 && touch index.ts)` this replaces scheduled a *fresh*
# restart every time it was restarted — one restart feeding the next forever.
# The API then flapped between UP and 502 every few seconds, the replacement
# raced the dying process for the port and died on EADDRINUSE (retrying the
# same way), and any e2e run started in that window failed on ECONNREFUSED or
# on stacked error toasts, which reads exactly like a product regression.
#
# A process killed by a signal exits 128+N, and that is the one case not to
# retry. Exiting with that same status also lets nodemon recognise its own kill.

node --experimental-strip-types --disable-warning=ExperimentalWarning index.ts
code=$?

[ "$code" -eq 0 ] && exit 0
[ "$code" -lt 128 ] || exit "$code"

# A genuine startup failure: a dependency not up yet, a syntax error. nodemon
# has nothing to watch for in that case, so bump index.ts to ask for another go.
sleep 2
touch index.ts
exit "$code"
