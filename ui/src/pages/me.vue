<template>
  <iframe
    :src="$sdUrl + '/me?embed=true'"
    width="100%"
    :style="{ height: iframeHeight }"
    frameborder="0"
    @load="onLoad"
  />
</template>

<script lang="ts" setup>
import { usePermissions } from '~/composables/use-permissions'

const router = useRouter()
const session = useSession()

const iframeHeight = ref('600px')

const { missingSubscription } = usePermissions()

onMounted(() => {
  if (missingSubscription.value && session.state.account?.type === 'organization') {
    router.replace('/subscription')
  }
})

function onLoad (e: Event) {
  const iframe = e.target as HTMLIFrameElement
  try {
    const height = iframe.contentWindow?.document.body.scrollHeight
    if (height) iframeHeight.value = height + 'px'
  } catch {}
}
</script>
