<template>
  <v-col class="applications-facets">
    <template v-if="showOwnerFacets">
      <v-select
        v-model="facetsValues.owner"
        multiple
        :label="$t('owner')"
        :items="facets.owner"
        :item-value="item => item.value && `${item.value.type}:${item.value.id}:${item.value.department ? item.value.department : '-'}`"
        :item-text="item => item.value && `${item.value.name}${item.value.department ? ' / ' + (item.value.departmentName || item.value.department) : ''} (${item.count})`"
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
        :item-text="item => `${{public: 'Public', private: 'Privé', protected: 'Protégé'}[item.value]} (${item.count})`"
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
        :item-value="item => item.value.id"
        :item-text="item => `${item.value.title} (${item.count})`"
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
        :items="facets.publicationSites"
        :item-value="item => item.value || 'null'"
        :item-text="item => publicationSiteText(item)"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets['base-application']">
      <v-select
        v-model="facetsValues['base-application']"
        multiple
        :label="$t('app')"
        :items="facets['base-application']"
        :item-value="item => item.value.url"
        :item-text="item => `${item.value.title} ${item.value.version || ''} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>
  </v-col>
</template>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  visibility: Visibilité
  topics: Thématiques
  portals: Portails
  app: Application
en:
  owner: Owner
  visibility: Visibility
  topics: Topics
  portals: Portals
  app: Application
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: ['facets', 'facetsValues', 'showShared'],
  data () {
    return { visibleFacet: 'visibility' }
  },
  computed: {
    ...mapState(['vocabulary', 'env']),
    ...mapGetters(['activeAccountPublicationSitesById']),
    ...mapGetters('session', ['activeAccount']),
    showOwnerFacets () {
      if (!this.facets.owner) return false
      if (this.showShared) return true
      if (!this.activeAccount.department && this.facets.owner.find(o => !!o.value.department)) return true
      return false
    }
  },
  methods: {
    publicationSiteText (item) {
      let title = item.value
      if (item.value === null) title = 'aucun'
      else {
        const publicationSite = this.activeAccountPublicationSitesById && this.activeAccountPublicationSitesById[item.value]
        if (publicationSite) {
          title = publicationSite.title || publicationSite.url || publicationSite.id
        }
      }
      return `${title} (${item.count})`
    }
  }
}
</script>

<style lang="less">
  .applications-facets {
    .v-subheader {
      cursor: pointer;
    }
    .v-subheader:not(:first-child) {
      margin-top: 16px;
    }
    .v-subheader {
      padding-left: 0;
      height: 20px;
    }
  }

</style>
