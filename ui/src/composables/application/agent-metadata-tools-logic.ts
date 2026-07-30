// Pure validation for set_application_summary, extracted for unit testing.
// Returns an error message to feed back to the agent, or null when valid.
export function validateApplicationSummary (summary: string): string | null {
  if (summary.length > 300) {
    return `Error: summary is ${summary.length} characters long, it must be 300 characters or less. Please shorten it and try again.`
  }
  const genericStarts = ['this application is', 'cette application est']
  if (genericStarts.some(s => summary.toLowerCase().startsWith(s))) {
    return 'Error: the summary must not start with a generic phrase like "This application is..." or "Cette application est...". Please rephrase with a more direct and specific opening.'
  }
  return null
}
