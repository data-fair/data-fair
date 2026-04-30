import { useRouter } from 'vue-router'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { useBreadcrumbs } from './use-breadcrumbs'

export function useDFramePage () {
  const router = useRouter()
  const breadcrumbs = useBreadcrumbs()

  // Create adapter once — do NOT use computed(), as each instance registers
  // a router.afterEach() listener. Recreating would leak listeners.
  const stateChangeAdapter = createStateChangeAdapter(router)

  function onMessage (message: { detail?: Record<string, unknown> } & Record<string, unknown>) {
    const detail = message?.detail ?? message
    if (detail && typeof detail === 'object' && 'breadcrumbs' in detail) {
      breadcrumbs.receive(detail)
    }
  }

  return { stateChangeAdapter, onMessage }
}
