<template>
  <d-frame
    :src="src"
    sync-params
    @notif="(msg: any) => sendUiNotif({ type: msg.type || 'success', msg: msg.body })"
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
