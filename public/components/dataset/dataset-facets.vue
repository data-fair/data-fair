<template>
  <div class="datasets-facets">
    <template v-if="facets.owner">
      <v-select
        v-model="facetsValues.owner"
        multiple
        :label="$t('owner')"
        :items="facets.owner"
        :item-value="item => item.value && `${item.value.type}:${item.value.id}`"
        :item-text="item => item.value && `${item.value.name} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.visibility && !env.disableSharing">
      <v-select
        v-model="facetsValues.visibility"
        multiple
        :label="$t('visibility')"
        :items="facets.visibility"
        item-value="value"
        :item-text="item => item.value && `${{public: 'Public', private: 'Privé', protected: 'Protégé'}[item.value]} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.status">
      <v-select
        v-model="facetsValues.status"
        multiple
        :label="$t('status')"
        :items="facets.status"
        item-value="value"
        :item-text="item => item.value && `${statuses.dataset[item.value] ? (statuses.dataset[item.value].title[$i18n.locale] || statuses.dataset[item.value].title[$i18n.defaultLocale]) : item.value} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.topics">
      <v-select
        v-model="facetsValues.topics"
        multiple
        :label="$t('topics')"
        :items="facets.topics"
        :item-value="item => item.value && item.value.id"
        :item-text="item => item.value && `${item.value.title} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.publicationSites && facets.publicationSites.find(item => item.value !== null)">
      <v-select
        v-model="facetsValues.publicationSites"
        multiple
        :label="$t('portals')"
        :items="facets.publicationSites.filter(item => !item.value || (activeAccountPublicationSitesById && activeAccountPublicationSitesById[item.value]))"
        :item-value="item => item.value || 'null'"
        :item-text="item => publicationSiteText(item)"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.services">
      <v-select
        v-model="facetsValues.services"
        multiple
        :label="$t('extensions')"
        :items="facets.services"
        item-value="value"
        :item-text="item => item.value && `${item.value.replace('koumoul-', '').replace('-koumoul', '')} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.concepts">
      <v-select
        v-model="facetsValues.concepts"
        multiple
        :label="$t('concepts')"
        :items="facets.concepts.filter(facetItem => vocabulary && vocabulary[facetItem.value])"
        item-value="value"
        :item-text="item => item.value && `${vocabulary && vocabulary[item.value] && vocabulary[item.value].title} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  visibility: Visibilité
  status: État
  topics: Thématiques
  portals: Portails
  extensions: Enrichissement
  concepts: Concepts
en:
  owner: Owner
  visibility: Visibility
  status: Status
  topics: Topics
  portals: Portals
  extension: Extensions
  concepts: Concepts
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import statuses from '../../../shared/statuses.json'

export default {
  props: ['facets', 'facetsValues'],
  data () {
    return { statuses, visibleFacet: 'visibility' }
  },
  computed: {
    ...mapState(['vocabulary', 'env']),
    ...mapGetters(['activeAccountPublicationSitesById'])
  },
  methods: {
    publicationSiteText (item) {
      let title
      if (item.value === null) title = 'aucun'
      else {
        const publicationSite = this.activeAccountPublicationSitesById && this.activeAccountPublicationSitesById[item.value]
        if (publicationSite) {
          title = publicationSite.title || publicationSite.url || publicationSite.id
        } else {
          return null
        }
      }
      return `${title} (${item.count})`
    }
  }
}
</script>

<style lang="less">
  .datasets-facets {
    .v-subheader:not(:first-child) {
      margin-top: 16px;
    }
    .v-subheader {
      padding-left: 0;
      height: 20px;
    }
  }

</style>
