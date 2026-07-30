// Generic renderer for page-guidance tools. Section/tab descriptions are
// co-located with each page's `sections` computed; this is a thin renderer.
export type GuidedTab = { key: string, title: string, agentDesc?: string }
export type GuidedSection = { title: string, agentDesc?: string, tabs?: GuidedTab[] }
export type GuidedSections = Record<string, GuidedSection>

export function buildGuidance (heading: string, intro: string, sections: GuidedSections): string {
  const lines: string[] = [`# ${heading}`, '', intro, '']

  for (const section of Object.values(sections)) {
    const tabsWithDesc = section.tabs?.filter(t => t.agentDesc) ?? []
    if (!section.agentDesc && !tabsWithDesc.length) continue
    lines.push(`## ${section.title}`)
    if (section.agentDesc) lines.push(section.agentDesc)
    for (const tab of tabsWithDesc) {
      lines.push(`- **${tab.title}** — ${tab.agentDesc}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}
