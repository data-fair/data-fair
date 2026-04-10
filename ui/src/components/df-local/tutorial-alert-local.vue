<!-- eslint-disable vue/no-v-html -->
<template>
  <div
    v-if="show || persistent"
    class="pt-3 pb-4 pr-3"
    style="position: relative;"
  >
    <v-btn
      :icon="show ? mdiCloseCircleOutline : mdiInformationOutline"
      :title="show ? t('closeHelp') : t('readHelp')"
      style="position: absolute; top: 0; right: 0; z-index: 1;"
      density="compact"
      color="success"
      variant="flat"
      @click="show = !show"
    />
    <v-alert
      v-if="show"
      :text="(!$slots.default && !href && !html) ? (text ?? undefined) : undefined"
      color="success"
      density="compact"
      variant="outlined"
      border="start"
    >
      <template
        v-if="href"
        #text
      >
        <a
          :href="href"
          target="_blank"
        >{{ text || t('readDoc') }}</a>
      </template>
      <template
        v-else-if="html"
        #text
      >
        <div v-html="html" />
      </template>
      <slot />
    </v-alert>
  </div>
</template>

<i18n lang="yaml">
fr:
  readHelp: Ouvrez un message d'aide
  closeHelp: Fermez le message d'aide
  readDoc: Consultez la documentation
en:
  readHelp: Open a help message
  closeHelp: Close the help message
  readDoc: Read the documentation
</i18n>

<script setup lang="ts">
import { mdiCloseCircleOutline, mdiInformationOutline } from '@mdi/js'

const props = withDefaults(defineProps<{
  /** Unique identifier for the tutorial, used as localStorage key (`closed-tutorial-{id}`) */
  id: string
  /** External documentation URL, turns the alert into a clickable link */
  href?: string | null
  /** Text content to display in the alert */
  text?: string | null
  /** HTML content to display in the alert (alternative to text) */
  html?: string | null
  /** Whether to show the alert on first render, before any user interaction */
  initial?: boolean
  /** Keep the toggle button visible even when the alert is closed */
  persistent?: boolean
}>(), {
  href: null,
  text: null,
  html: null,
  initial: true,
  persistent: false
})

const { t } = useI18n()

const show = ref(false)
watch(show, () => {
  window.localStorage['closed-tutorial-' + props.id] = '' + !show.value
})
onMounted(() => {
  if (window.localStorage && window.localStorage['closed-tutorial-' + props.id] !== 'true') {
    show.value = props.initial
  }
})
</script>
