import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { useBreadcrumbs } from './use-breadcrumbs'

export function useDFramePage () {
  const router = useRouter()
  const breadcrumbs = useBreadcrumbs()
  const { height: windowHeight } = useWindowSize()

  // Create adapter once — do NOT use computed(), as each instance registers
  // a router.afterEach() listener. Recreating would leak listeners.
  const stateChangeAdapter = createStateChangeAdapter(router)

  const frameHeight = computed(() => (windowHeight.value - 48) + 'px')

  function onMessage (message: any) {
    const detail = message?.detail ?? message
    if (detail?.breadcrumbs) {
      breadcrumbs.receive(detail)
    }
  }

  return { stateChangeAdapter, frameHeight, onMessage }
}
