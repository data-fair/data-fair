<template>
  <v-dialog
    v-model="showDialog"
    max-width="500"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('title') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="showDialog = false"
        />
      </v-toolbar>
      <v-card-text class="py-0 px-3">
        <iframe
          v-if="showDialog"
          :src="iframeUrl"
          style="width: 100%; height: 300px; border: none; background-color: transparent;"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  title: Webhooks
en:
  title: Webhooks
</i18n>

<script lang="ts" setup>
import { mdiClose } from '@mdi/js'

const props = defineProps<{
  resource: { id: string, slug?: string, title: string, owner: { type: string, id: string, department?: string } }
  resourceType: 'dataset' | 'application'
}>()

const { t } = useI18n()

const showDialog = ref(false)

const eventsUrl = window.location.origin + '/events'

const iframeUrl = computed(() => {
  const keys = `data-fair:${props.resourceType}-data-updated:${props.resource.slug}`
  const titles = props.resource.title.replace(/,/g, ' ')
  let sender = `${props.resource.owner.type}:${props.resource.owner.id}`
  if (props.resource.owner.department) sender += ':' + props.resource.owner.department
  return `${eventsUrl}/embed/subscribe-webhooks?key=${encodeURIComponent(keys)}&title=${encodeURIComponent(titles)}&sender=${encodeURIComponent(sender)}`
})
</script>
