<template>
  <v-dialog
    v-if="!inline"
    v-model="showDialog"
    max-width="800"
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
      <v-card-text>
        <p class="mb-4">
          {{ resourceType === 'datasets' ? t('integrationMsgDataset') : t('integrationMsgApp') }}
        </p>

        <v-select
          v-model="mode"
          :label="t('integrationMode')"
          :items="['iframe', 'd-frame']"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-4"
          style="max-width: 300px;"
        />

        <template v-if="mode === 'd-frame'">
          <p
            class="mb-2"
            v-html="t('dFrameIntro')"
          />
          <v-checkbox
            v-model="syncParams"
            :label="t('syncParams')"
            density="compact"
            hide-details
            class="mb-4"
          />
        </template>

        <v-textarea
          :model-value="snippet"
          readonly
          variant="outlined"
          rows="4"
          auto-grow
          hide-details
          class="mb-2"
          style="font-family: monospace;"
        />

        <v-btn
          color="primary"
          variant="tonal"
          size="small"
          :prepend-icon="copied ? mdiCheck : mdiContentCopy"
          @click="copyToClipboard"
        >
          {{ copied ? t('copied') : t('copy') }}
        </v-btn>
      </v-card-text>
    </v-card>
  </v-dialog>
  <div v-else>
    <p class="mb-4">
      {{ resourceType === 'datasets' ? t('integrationMsgDataset') : t('integrationMsgApp') }}
    </p>

    <v-select
      v-model="mode"
      :label="t('integrationMode')"
      :items="['iframe', 'd-frame']"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-4"
      style="max-width: 300px;"
    />

    <template v-if="mode === 'd-frame'">
      <p
        class="mb-2"
        v-html="t('dFrameIntro')"
      />
      <v-checkbox
        v-model="syncParams"
        :label="t('syncParams')"
        density="compact"
        hide-details
        class="mb-4"
      />
    </template>

    <v-textarea
      :model-value="snippet"
      readonly
      variant="outlined"
      rows="4"
      auto-grow
      hide-details
      class="mb-2"
      style="font-family: monospace;"
    />

    <v-btn
      color="primary"
      variant="tonal"
      size="small"
      :prepend-icon="copied ? mdiCheck : mdiContentCopy"
      @click="copyToClipboard"
    >
      {{ copied ? t('copied') : t('copy') }}
    </v-btn>
  </div>
</template>

<i18n lang="yaml">
fr:
  title: Code d'intégration
  integrationMsgDataset: Pour intégrer une prévisualisation de ce jeu de données dans un site vous pouvez copier le code suivant dans le code source HTML.
  integrationMsgApp: Pour intégrer cette application dans un site vous pouvez copier le code suivant dans le code source HTML.
  integrationMode: Mode d'intégration
  dFrameIntro: <a href="https://data-fair.github.io/frame/latest/">D-Frame</a> est un composant que vous pouvez intégrer à votre site pour une intégration plus riche.
  syncParams: Synchroniser les paramètres de l'application
  copy: Copier
  copied: Copié !
en:
  title: Integration code
  integrationMsgDataset: To integrate a preview of this dataset in a website you can copy the code below in your HTML source code.
  integrationMsgApp: To integrate this application in a website you can copy the code below in your HTML source code.
  integrationMode: Integration mode
  dFrameIntro: <a href="https://data-fair.github.io/frame/latest/">D-Frame</a> is a component that you can integrate in your website for a richer integration.
  syncParams: Synchronize the application parameters
  copy: Copy
  copied: Copied!
</i18n>

<script lang="ts" setup>
import { mdiCheck, mdiClose, mdiContentCopy } from '@mdi/js'

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  resource: { id: string, slug?: string, href?: string, previews?: { id?: string, href?: string, title?: string }[] }
  inline?: boolean
}>()

const { t } = useI18n()

const showDialog = ref(false)
const mode = ref<'iframe' | 'd-frame'>('iframe')
const syncParams = ref(false)
const copied = ref(false)

const embedUrl = computed(() => {
  if (props.resourceType === 'datasets') {
    return props.resource.previews?.[0]?.href || ''
  }
  return props.resource.href || ''
})

const syncParamsAttr = computed(() => {
  return syncParams.value ? `\n  sync-params="*:${props.resource.id}"` : ''
})

const snippet = computed(() => {
  if (mode.value === 'iframe') {
    return `<iframe\n  src="${embedUrl.value}"\n  width="100%" height="500px" style="background-color: transparent; border: none;"\n></iframe>`
  }
  return `<d-frame\n  src="${embedUrl.value}?d-frame=true"\n  height="500px"\n  scrolling="no"\n  resize="no"${syncParamsAttr.value}\n/>`
})

const copyToClipboard = async () => {
  await navigator.clipboard.writeText(snippet.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

watch(showDialog, () => {
  mode.value = 'iframe'
  syncParams.value = false
  copied.value = false
})
</script>
