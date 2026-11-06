<template>
  <!-- only admin mode can add a portal, the list is otherwise edit-only -->
  <p
    v-if="!user.adminMode && !publicationSites?.length"
    class="text-medium-emphasis"
  >
    {{ t('noPortal') }}
    <i18n-t
      v-if="$uiConfig.portalsIntegration"
      keypath="portalsIntegration"
      tag="span"
    >
      <template #link>
        <router-link to="/portals">
          {{ t('portalsLink') }}
        </router-link>
      </template>
    </i18n-t>
  </p>
  <v-defaults-provider
    v-else
    :defaults="{ global: { hideDetails: 'auto' } }"
  >
    <v-form v-model="valid">
      <vjsf
        v-model="editPublicationSites"
        :schema="schema"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<i18n lang="yaml">
fr:
  noPortal: Aucun portail.
  portalsIntegration: "Les portails sont ajoutés automatiquement lorsque vous les créez dans la {link}."
  portalsLink: gestion des portails
en:
  noPortal: No portal.
  portalsIntegration: "Portals are added automatically when you create them in the {link}."
  portalsLink: portals management
</i18n>

<script setup lang="ts">
import publicationSitesContract from '~/../../api/contract/publication-sites'
import { type Settings } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import { localizedMetadata } from '~/utils/settings-metadata-form'

const publicationSites = defineModel<Settings['publicationSites']>()
const valid = defineModel<boolean>('valid', { default: true })
const { datasetsMetadata } = defineProps<{ datasetsMetadata: Settings['datasetsMetadata'] }>()

const { t, locale } = useI18n()
const { user } = useSessionAuthenticated()
const publicationSitesSchema = publicationSitesContract(false)
const publicationSitesAdminSchema = publicationSitesContract(true)
const schema = computed(() => user.value.adminMode ? publicationSitesAdminSchema : publicationSitesSchema)

const editPublicationSites = ref<Settings['publicationSites']>()
watchDeepDiff(publicationSites, () => {
  editPublicationSites.value = publicationSites.value
}, { immediate: true })
watchDeepDiff(editPublicationSites, () => {
  publicationSites.value = editPublicationSites.value
}, {})

// every metadata shown on datasets can be required
const context = computed(() => ({
  DatasetsMetadata: Object.values(localizedMetadata(locale.value))
    .filter(m => m.alwaysActive || ((datasetsMetadata as any)?.[m.key]?.active ?? m.defaultActive))
    .map(({ key, title }) => ({ key, title }))
}))

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value,
  context: context.value
}))
</script>
