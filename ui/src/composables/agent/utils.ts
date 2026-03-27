import type { Ref } from 'vue'

type Messages = Record<string, Record<string, string>>

/**
 * Create a translation function for agent tool annotations.
 * Falls back to English, then to the key itself.
 */
export function createAgentTranslator (messages: Messages, locale: Ref<string>) {
  return (key: string) => messages[locale.value]?.[key] ?? messages.en[key] ?? key
}

/**
 * Format an error for agent tool error responses.
 */
export function agentToolError (label: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: 'text' as const, text: `${label}: ${message}` }],
    isError: true
  }
}
