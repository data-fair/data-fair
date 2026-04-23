<template>
  <v-snackbar-queue
    v-model="queue"
    :timeout="5000"
    :total-visible="5"
    :z-index="2600 /* Higher than agent-chat's 2500 */"
    location="bottom right"
    display-strategy="overflow"
    max-width="500"
    max-height="500"
    collapsed
    closable
  >
    <template #text="{ item }">
      <p v-if="item.msg">
        {{ item.msg }}
      </p>
      <p
        v-if="item.errorMsg"
        :class="item.msg ? 'mt-1' : ''"
      >
        {{ item.errorMsg }}
      </p>
    </template>
    <template #actions="{ props: btnProps }">
      <v-btn
        v-bind="btnProps"
        :title="t('ignore')"
        :icon="mdiClose"
        variant="text"
        size="small"
        class="mt-1"
      />
    </template>
  </v-snackbar-queue>
</template>

<i18n lang="yaml">
  en:
    ignore: Dismiss
  fr:
    ignore: Ignorer
</i18n>

<script setup lang="ts">
import type { UiNotif } from '@data-fair/lib-vue/ui-notif.js'
import inIframe from '@data-fair/lib-utils/in-iframe.js'
import { useUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiClose } from '@mdi/js'

type QueueItem = {
  msg: string
  errorMsg?: string
  color?: string
  timeout?: number
  contentClass?: string
}

const { t } = useI18n()
const uiNotif = useUiNotif()
const queue = ref<QueueItem[]>([])

/** Convert a UiNotif to a QueueItem, with some special handling for error notif */
function toItem (notif: UiNotif): QueueItem {
  if (notif.type === 'error') {
    return {
      msg: notif.msg,
      errorMsg: notif.errorMsg,
      color: notif.clientError ? 'warning' : 'error',
      timeout: 30 * 1000, // 1 minute for error notif
      contentClass: 'ui-notif-local__content'
    }
  }
  return {
    msg: notif.msg,
    color: notif.type === 'default' ? undefined : notif.type
  }
}

watch(() => uiNotif.notification.value, (notif) => {
  if (!notif || inIframe) return
  queue.value.push(toItem(notif))
})
</script>

<style>
.ui-notif-local__content {
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.v-snackbar__actions {
  align-self: flex-start;
}
</style>
