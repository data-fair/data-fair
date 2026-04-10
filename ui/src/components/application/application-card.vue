<template>
  <v-card
    :to="`/application/${application.id}`"
    class="h-100 d-flex flex-column"
  >
    <v-card-item class="text-primary">
      <template #title>
        <span
          class="font-weight-bold"
          :title="application.title || application.id"
        >{{ application.title || application.id }}</span>
      </template>
      <template #append>
        <owner-avatar
          v-if="showAll || !!(application.owner?.department && !session.state.account?.department)"
          :owner="application.owner"
          :omit-owner-name="!showAll"
        />
      </template>
    </v-card-item>

    <v-img
      :src="captureUrl"
      :aspect-ratio="1050 / 450"
      class="flex-grow-1"
    />

    <!--
      min-height: auto => remove default v-card-actions min-height
    -->
    <v-card-actions
      class="flex-column align-start text-body-small py-2"
      style="min-height: auto"
    >
      <!-- Topics list -->
      <v-row
        v-if="application.topics?.length"
        density="compact"
      >
        <v-col
          v-for="topic in application.topics"
          :key="topic.id"
          cols="auto"
        >
          <v-chip
            :text="topic.title"
            :color="topic.color"
            density="compact"
            size="small"
            variant="flat"
          />
        </v-col>
      </v-row>

      <!-- Visibility + Updated at -->
      <div class="d-flex align-center flex-wrap">
        <resource-visibility
          v-if="application.visibility"
          :visibility="application.visibility"
          size="small"
        />
        <span
          v-if="application.updatedAt"
          class="ml-2"
        >
          {{ t('updatedAt', { date: formatDate(application.updatedAt) }) }}
        </span>
      </div>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import type { Application } from '#api/types'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'

const { t, locale } = useI18n()
const session = useSession()
const showAll = useBooleanSearchParam('showAll')

const props = defineProps<{
  application: Partial<Application> & Pick<Application, 'id' | 'title' | 'updatedAt' | 'owner'> & { visibility?: 'public' | 'private' | 'protected', thumbnail?: string }
}>()

const captureUrl = computed(() => {
  return props.application.thumbnail || props.application.image || `${props.application.href}/capture?updatedAt=${props.application.updatedAt}`
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>

<i18n lang="yaml">
fr:
  updatedAt: Mis à jour le {date}
en:
  updatedAt: Updated on {date}
</i18n>
