<template>
  <iframe
    :src="$sdUrl + '/me?embed=true'"
    width="100%"
    style="height: 100%; border: none;"
  />
</template>

<script setup lang="ts">
import { usePermissions } from '~/composables/use-permissions'

const router = useRouter()
const session = useSession()

const { missingSubscription } = usePermissions()

onMounted(() => {
  if (missingSubscription.value && session.state.account?.type === 'organization') {
    router.replace('/subscription')
  }
})
</script>
