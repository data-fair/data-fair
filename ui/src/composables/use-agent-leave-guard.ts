import { onUnmounted, toValue, type MaybeRefOrGetter } from 'vue'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard'
import { registerUnsavedEdit } from '~/composables/agent/unsaved-edits'

/**
 * `useLeaveGuard`, plus the same dirty flag published to the assistant's `navigate`
 * tool, which refuses to leave while it is set (see `agent/unsaved-edits.ts`).
 * `label` names the edits in that refusal, in English, for the model.
 */
export function useAgentLeaveGuard (isDirty: MaybeRefOrGetter<boolean>, options: { locale: MaybeRefOrGetter<string>, label: string }) {
  useLeaveGuard(isDirty, { locale: options.locale })
  onUnmounted(registerUnsavedEdit({ label: options.label, isDirty: () => !!toValue(isDirty) }))
}
