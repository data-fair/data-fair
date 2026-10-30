<template>
  <d-frame
    :src="src"
    sync-params
    @notif="(e: any) => sendUiNotif(frameNotifArg(e.detail))"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  resourceType: 'dataset' | 'application'
  resourceId: string
}>()

const { sendUiNotif } = useUiNotif()

const src = computed(() => {
  return `${window.location.origin}/events/embed/events?resource=${encodeURIComponent(props.resourceType + '/' + props.resourceId)}`
})
</script>
