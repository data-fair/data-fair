// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// A deliberately simple tokenizer shared by the analysis scripts: lowercase, strip diacritics
// (mongo text indexes are diacritic-insensitive), split on non-letters, drop 1-char tokens and a
// short French stopword list. Not a stemmer — the real engine comparison happens in mongo-ab.mjs.

const STOP = new Set('le la les de des du un une et en au aux a à d l par pour sur dans ou où ne pas est sont ce cette ces son sa ses avec plus'.split(' '))

export const tokenize = (text) => (text ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/)
  .filter(t => t.length > 1 && !STOP.has(t))
