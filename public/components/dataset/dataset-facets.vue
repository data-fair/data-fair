<template>
  <v-col class="datasets-facets">
    <template v-if="showOwnerFacets">
      <v-select
        v-if="ownerProps.items.length <= 10"
        v-model="facetsValues.owner"
        v-bind="ownerProps"
      />
      <v-autocomplete
        v-else
        v-model="facetsValues.owner"
        v-bind="ownerProps"
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
        :label="$t('publicationSites')"
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

    <template v-if="facets.requestedPublicationSites && facets.requestedPublicationSites.find(item => item.value !== null)">
      <v-select
        v-model="facetsValues.requestedPublicationSites"
        multiple
        :label="$t('requestedPublicationSites')"
        :items="facets.requestedPublicationSites.filter(item => !item.value || (activeAccountPublicationSitesById && activeAccountPublicationSitesById[item.value]))"
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
  </v-col>
</template>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  visibility: Visibilité
  status: État
  topics: Thématiques
  publicationSites: Portails
  requestedPublicationSites: Portails à valider
  extensions: Enrichissement
  concepts: Concepts
en:
  owner: Owner
  visibility: Visibility
  status: Status
  topics: Topics
  publicationSites: Portals
  requestedPublicationSites: Requested publications
  extension: Extensions
  concepts: Concepts
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import statuses from '../../../shared/statuses.json'

export default {
  props: ['facets', 'facetsValues', 'showShared'],
  data () {
    return { statuses, visibleFacet: 'visibility' }
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
    },
    ownerProps () {
      return {
        multiple: true,
        label: this.$t('owner'),
        items: this.facets.owner,
        itemValue: item => item.value && `${item.value.type}:${item.value.id}:${item.value.department ? item.value.department : '-'}`,
        itemText: item => item.value && `${this.ownerName(item.value)} (${item.count})`,
        outlined: true,
        dense: true,
        hideDetails: true,
        rounded: true,
        class: 'mb-4'
      }
    }
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
    },
    ownerName (owner) {
      if (!owner.department) return owner.name
      if (this.activeAccount.type === owner.type && this.activeAccount.id === owner.id) {
        return owner.departmentName || owner.department
      }
      return `${owner.name}/${owner.departmentName || owner.department}`
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
