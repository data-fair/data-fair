<template lang="html">
  <v-row v-if="remoteService">
    <v-col
      cols="12"
      md="6"
      order-md="2"
    >
      <v-sheet v-if="remoteService.apiDoc">
        <v-list density="compact">
          <v-list-item
            v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.url"
            :prepend-avatar="mdiHome"
          >
            <span><a :href="remoteService.apiDoc.info.contact.url">{{ remoteService.apiDoc.info.contact.name || remoteService.apiDoc.info.contact.url }}</a></span>
          </v-list-item>
          <v-list-item
            v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.email"
            :prepend-avatar="mdiEmail"
          >
            <span><a :href="'mailto:'+remoteService.apiDoc.info.contact.email">{{ remoteService.apiDoc.info.contact.email }}</a></span>
          </v-list-item>
          <v-list-item
            v-if="remoteService.apiDoc.info.version"
            :avatar="mdiLabel"
          >
            <span>{{ remoteService.apiDoc.info.version }}</span>
          </v-list-item>
          <v-list-item
            v-if="remoteService.apiDoc.info.termsOfService"
            :append-avatar="mdiInformationVariant"
          >
            <span><a :href="remoteService.apiDoc.info.termsOfService">{{ t('termsOfService') }}</a></span>
          </v-list-item>
        </v-list>
      </v-sheet>
    </v-col>
    <v-col
      cols="12"
      md="6"
      order-md="1"
    >
      <v-text-field
        v-model="remoteService.title"
        :label="t('title')"
        color="admin"
      />
      <markdown-editor
        v-model="remoteService.description"
        :label="t('description')"
        :easy-mde-options="easyMdeOptions"
        :locale="locale"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  termsOfService: Conditions d'utilisation
  title: Titre
  description: Description
en:
  termsOfService: Terms of service
  title: Title
  description: Description
</i18n>

<script lang="ts" setup>
import type { RemoteService } from '#api/types'
import { mdiEmail, mdiHome, mdiInformationVariant, mdiLabel } from '@mdi/js'
import { MarkdownEditor } from '@koumoul/vjsf-markdown'

const remoteService = defineModel<RemoteService>()

const { t, locale } = useI18n()

const easyMdeOptions = { minHeight: '150px' }
</script>

<style lang="css">
</style>
