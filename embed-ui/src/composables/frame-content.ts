import '@koumoul/v-iframe/content-window.js'
import vueRouterDFrameContent from '@data-fair/frame/lib/vue-router/d-frame-content.js'
export const useFrameContent = () => {
  const route = useRoute()
  const router = useRouter()

  if (route.query['d-frame'] === 'true') {
    vueRouterDFrameContent(router)
  } else {
    // @ts-ignore
    window.vIframeOptions = { router, reactiveParams: true }
  }
}
