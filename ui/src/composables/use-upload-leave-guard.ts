// ui/src/composables/use-upload-leave-guard.ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard.js'

// Upload-specific message shown when the user tries to leave while a file upload
// is running. More explicit than the lib's generic "unsaved modifications" text.
// It is only displayed for in-app navigation (window.confirm); on tab close /
// reload modern browsers show their own generic prompt instead.
const messages = {
  fr: 'Un envoi de fichier est en cours. Si vous quittez la page maintenant, l\'envoi sera interrompu et le fichier ne sera pas chargé.',
  en: 'A file upload is in progress. If you leave now, the upload will be interrupted and the file will not be loaded.'
}

/**
 * Guard against leaving the page while a file upload is in progress.
 * Thin wrapper over the shared `useLeaveGuard` that supplies the upload-specific
 * message and forwards `onConfirmLeave`, so the caller can abort the in-flight
 * request (and thus stop the dataset creation/update) before navigation proceeds.
 */
export const useUploadLeaveGuard = (
  isUploading: MaybeRefOrGetter<boolean>,
  options?: { locale?: MaybeRefOrGetter<string>, onConfirmLeave?: () => void }
) => {
  const message = messages[(options?.locale ? toValue(options.locale) : 'en') as 'fr' | 'en'] ?? messages.en
  useLeaveGuard(isUploading, { message, onConfirmLeave: options?.onConfirmLeave })
}

export default useUploadLeaveGuard
