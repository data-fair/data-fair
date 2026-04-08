<template>
  <d-frame
    id="me"
    :src="$sdUrl + '/me?embed=true'"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'
import { usePermissions } from '~/composables/use-permissions'

const router = useRouter()
const session = useSession()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

const { missingSubscription } = usePermissions()

onMounted(() => {
  if (missingSubscription.value && session.state.account?.type === 'organization') {
    router.replace('/subscription')
  }
})
</script>
