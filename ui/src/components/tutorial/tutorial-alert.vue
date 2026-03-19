<!-- eslint-disable vue/no-v-html -->
<template lang="html">
  <div
    class="tutorial-alert py-2 pr-2"
  >
    <v-alert
      v-if="show"
      color="success"
      variant="outlined"
      density="compact"
      border="start"
      class="ma-0"
    >
      <slot>
        <a
          v-if="href"
          :href="href"
          target="_blank"
          class="text-success"
        >{{ text || t('readDoc') }}</a>
        <template v-else>
          <span
            v-if="text"
            v-text="text"
          />
          <div
            v-else-if="html"
            v-html="html"
          />
        </template>
      </slot>
    </v-alert>
    <v-btn
      v-if="show || (!show && persistent)"
      class="toggle"
      color="success"
      size="sm"
      :title="show ? t('closeHelp') : t('readHelp')"
      :icon="show ? mdiCloseCircleOutline : mdiInformationOutline"
      @click="show = !show"
    />
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

<script lang="ts" setup>
import { mdiCloseCircleOutline, mdiInformationOutline } from '@mdi/js'

const { id, initial } = defineProps({
  id: { type: String, required: true },
  href: { type: String, required: false, default: null },
  text: { type: String, required: false, default: null },
  html: { type: String, required: false, default: null },
  initial: { type: Boolean, default: true },
  persistent: { type: Boolean, default: false }
})

const { t } = useI18n()

const show = ref(false)
watch(show, () => {
  if (!show.value) window.localStorage['closed-tutorial-' + id] = 'true'
})
onMounted(() => {
  if (window.localStorage) {
    if (window.localStorage['closed-tutorial-' + id] !== 'true') {
      show.value = initial
    }
  }
})
</script>

<style lang="css">
.tutorial-alert {
  /*background-color: rgba(10, 10, 10, 0.1);*/
  position: relative;
  overflow:visible;
  min-height:20px;
}
.tutorial-alert .v-alert .v-alert__dismissible {
  position: absolute;
  top: 8px;
  right: 8px;
}
.tutorial-alert .toggle.v-btn {
  position: absolute;
  top: -4px;
  right: -4px;
}
.tutorial-alert .toggle.v-btn .v-icon {
  border-radius: 30px;
}
</style>
