const cap = schema.find(p => p.key === col)['x-capabilities']
if (cap && cap.textAgg) showWordCloud()
const sortable = !cap || cap.values !== false || cap.insensitive !== false
fetch(`${base}/schema?capability=textStandard`)
const qs = `${col}.text_standard:${term} OR ${col}.keyword_insensitive:${term2}`
