<template>
  <v-toolbar-items>
    <!-- Eager to prevent ARIA errors-->
    <v-menu
      :close-on-content-click="false"
      style="z-index: 2600"
      max-height="400"
      max-width="500"
      width="100%"
      eager
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :title="t('openNotificationList')"
          stacked
          @click="refresh()"
        >
          <v-badge
            :model-value="!!countNew"
            :content="countNew"
            color="warning"
          >
            <v-icon :icon="mdiBell" />
          </v-badge>
        </v-btn>
      </template>

      <v-list
        density="compact"
        class="py-0"
      >
        <v-list-item v-if="!session.state.user">
          {{ t('loginRequired.part1') }} <a
            :href="session.loginUrl()"
            class="simple-link"
          >{{ t('loginRequired.part2') }}</a> {{ t('loginRequired.part3') }}
        </v-list-item>
        <v-list-item v-else-if="!notifications.length">
          {{ t('noNotifications') }}
        </v-list-item>
        <v-list-item
          v-for="notif in notifications"
          v-else
          :key="notif._id"
          :href="notif.url"
          :value="notif._id"
          :active="notif.new"
          active-class="text-warning"
          lines="three"
        >
          <template #title>
            <span :title="notif.title">{{ notif.title }}</span>
          </template>
          <template #subtitle>
            {{ dayjs(notif.date).format('lll') }}
            <div v-if="notif.body">
              {{ notif.body }}
            </div>
          </template>

          <template
            v-if="notif.sender"
            #append
          >
            <owner-avatar :owner="notif.sender" />
          </template>
        </v-list-item>
      </v-list>
    </v-menu>
  </v-toolbar-items>
</template>

<script setup lang="ts">
import type { Emitter } from '@data-fair/lib-common-types/event/index.js'
import { ref, onMounted } from 'vue'
import { ofetch } from 'ofetch'
import OwnerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'
import useSession from '@data-fair/lib-vue/session.js'
import useLocaleDayjs from '@data-fair/lib-vue/locale-dayjs.js'
import { useI18n } from 'vue-i18n'
import { mdiBell } from '@mdi/js'

const { eventsUrl } = defineProps<{ eventsUrl: string }>()

const session = useSession()
const { dayjs } = useLocaleDayjs()
const { t } = useI18n()

type NotificationItem = {
  _id: string
  title: string
  date: string
  body?: string
  url?: string
  new?: boolean
  sender?: Emitter
}

type NotificationsRes = {
  results: NotificationItem[]
  count: number
  countNew: number
}

const notifications = ref<NotificationItem[]>([])
const countNew = ref(0)

async function refresh () {
  if (!session.state.user) return
  const res = await ofetch<NotificationsRes>(`${eventsUrl}/api/notifications`, { query: { size: 10 } })
  notifications.value = res.results
  countNew.value = res.countNew
}

onMounted(refresh)
</script>

<i18n lang="yaml">
  en:
    loginRequired:
      part1: You must
      part2: log in
      part3: to receive notifications.
    noNotifications: You have not received any notifications yet.
    openNotificationList: Open notification list

  fr:
    loginRequired:
      part1: Vous devez vous
      part2: connecter
      part3: pour recevoir des notifications.
    noNotifications: Vous n'avez pas encore reçu de notification.
    openNotificationList: Ouvrir la liste des notifications
</i18n>
