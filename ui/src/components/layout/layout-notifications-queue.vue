<template>
  <v-menu
    v-model="menuOpen"
    :close-on-content-click="false"
    min-width="320"
    max-width="420"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        icon
        variant="text"
      >
        <v-badge
          :model-value="unreadCount > 0"
          :content="unreadCount"
          color="error"
        >
          <v-icon :icon="mdiBell" />
        </v-badge>
      </v-btn>
    </template>

    <v-list density="compact">
      <v-list-item v-if="loading">
        <v-list-item-title class="text-body-medium text-medium-emphasis">
          {{ t('loading') }}
        </v-list-item-title>
      </v-list-item>
      <v-list-item v-else-if="!notifications.length">
        <v-list-item-title class="text-body-medium text-medium-emphasis">
          {{ t('noNotification') }}
        </v-list-item-title>
      </v-list-item>
      <template v-else>
        <v-list-item
          v-for="notif in notifications"
          :key="notif._id"
        >
          <v-list-item-title class="text-body-medium">
            {{ resolveText(notif.title) }}
          </v-list-item-title>
          <v-list-item-subtitle
            v-if="notif.body"
            class="text-body-small"
          >
            {{ resolveText(notif.body) }}
          </v-list-item-subtitle>
          <template #append>
            <span class="text-body-small text-medium-emphasis ml-2">
              {{ dayjs(notif.date).format('lll') }}
            </span>
          </template>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { mdiBell } from '@mdi/js'
import { useNotificationsWS } from '~/composables/use-notifications-ws'

const props = defineProps<{
  eventsUrl: string
}>()

const { t } = useI18n()
const session = useSession()
const { dayjs } = useLocaleDayjs()

interface Notification {
  _id: string
  title: string | Record<string, string>
  body?: string | Record<string, string>
  date: string
}

const menuOpen = ref(false)
const loading = ref(false)
const unreadCount = ref(0)
const notifications = ref<Notification[]>([])

function resolveText (text: string | Record<string, string>): string {
  if (typeof text === 'string') return text
  return text[session.lang.value] || text.fr || Object.values(text)[0] || ''
}

async function fetchCount () {
  try {
    const res = await fetch(`${props.eventsUrl}/api/v1/notifications?size=0`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    unreadCount.value = data.count ?? 0
  } catch {
    // silently ignore - events service may not be available
  }
}

async function fetchNotifications () {
  loading.value = true
  try {
    const res = await fetch(`${props.eventsUrl}/api/v1/notifications?size=10`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    notifications.value = data.results ?? []
  } catch {
    // silently ignore - events service may not be available
  } finally {
    loading.value = false
  }
}

watch(menuOpen, async (open) => {
  if (open) {
    await fetchNotifications()
  } else {
    notifications.value = []
    await fetchCount()
  }
})

fetchCount()

// Real-time WebSocket subscription
const userId = computed(() => session.state.user?.id)
if (userId.value) {
  useNotificationsWS(props.eventsUrl, userId.value, (notif) => {
    notifications.value.unshift(notif)
    unreadCount.value++
  })
}
</script>

<i18n lang="yaml">
fr:
  loading: Chargement...
  noNotification: Aucune notification
en:
  loading: Loading...
  noNotification: No notification
</i18n>
