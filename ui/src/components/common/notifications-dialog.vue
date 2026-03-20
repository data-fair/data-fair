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
          icon="mdi-close"
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
  title: Notifications
en:
  title: Notifications
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  resource: { id: string, slug?: string, title: string, owner: { type: string, id: string, department?: string } }
  resourceType: 'dataset' | 'application'
}>()

const { t } = useI18n()

const showDialog = ref(false)

const eventsUrl = window.location.origin + '/events'

const iframeUrl = computed(() => {
  const keys = `data-fair:${props.resourceType}-*:${props.resource.slug}`
  const titles = props.resource.title.replace(/,/g, ' ')
  const urlTemplate = `${$siteUrl}/data-fair/${props.resourceType}/${props.resource.id}`
  let sender = `${props.resource.owner.type}:${props.resource.owner.id}`
  if (props.resource.owner.department) sender += ':' + props.resource.owner.department
  return `${eventsUrl}/embed/subscribe?key=${encodeURIComponent(keys)}&title=${encodeURIComponent(titles)}&url-template=${encodeURIComponent(urlTemplate)}&sender=${encodeURIComponent(sender)}&register=false`
})
</script>
