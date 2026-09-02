<template>
  <div>
    <component :is="subtitle ? VListItemSubtitle : VListItemTitle">
      <div
        ref="message"
        class="journal-message"
        :class="{ 'journal-message-expanded': expanded }"
      >
        {{ text }}
      </div>
    </component>
    <v-btn
      v-if="truncated"
      variant="text"
      size="small"
      :color="color"
      :append-icon="expanded ? mdiChevronUp : mdiChevronDown"
      @click="expanded = !expanded"
    >
      {{ expanded ? t('collapseMessage') : t('expandMessage') }}
    </v-btn>
  </div>
</template>

<i18n lang="yaml">
fr:
  expandMessage: Voir le message complet
  collapseMessage: Réduire le message
en:
  expandMessage: Show full message
  collapseMessage: Collapse message
</i18n>

<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { mdiChevronDown, mdiChevronUp } from '@mdi/js'
import { VListItemSubtitle, VListItemTitle } from 'vuetify/components'

const { data } = defineProps<{
  data: string
  // render with the subtitle typography instead of the title one
  subtitle?: boolean
  color?: string
}>()

const { t } = useI18n()

// journal messages are plain text, sometimes copied verbatim from a third party (an nginx
// error body). Entries written before the api switched to plain newlines still carry their
// HTML line breaks, turn them back into newlines.
const text = computed(() => data.replace(/\s*<br\s*\/?>\s*/gi, '\n'))

// the message is clamped to 2 lines with a toggle to reveal the whole thing. Whether it
// actually overflows depends on the available width, so it is measured on the rendered
// element instead of being guessed from the text length.
const message = useTemplateRef('message')
const expanded = ref(false)
const truncated = ref(false)
const measure = () => {
  // an expanded message is not clamped anymore, keep the last measure so the toggle stays
  // available to collapse it back
  if (!message.value || expanded.value) return
  truncated.value = message.value.scrollHeight > message.value.clientHeight + 1
}
useResizeObserver(message, measure)
// the web font is loaded with font-display: swap, it changes the line count after the first
// render without changing the clamped height, so the resize observer does not fire
onMounted(() => document.fonts.ready.then(measure))
</script>

<style scoped>
.journal-message {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  white-space: pre-line;
}
.journal-message-expanded {
  display: block;
  max-height: 300px;
  overflow-y: auto;
}
</style>
