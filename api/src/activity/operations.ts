// pure merge of recently-updated datasets and applications into a single activity feed
// (the unit-test surface for the activity module)

export const mergeActivity = (datasets: Record<string, any>[], applications: Record<string, any>[], size: number) => {
  for (const d of datasets) d.type = 'dataset'
  for (const a of applications) a.type = 'application'

  const results = datasets.concat(applications)
    .map(line => {
      line.date = line.updatedAt
      delete line.updatedAt
      return line
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, size)

  return results
}
