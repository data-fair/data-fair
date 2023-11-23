<template lang="html">
  <v-row>
    <v-col
      cols="12"
      md="6"
      lg="5"
      order-md="2"
    >
      <v-sheet style="background: transparent;">
        <v-list
          dense
          style="background: transparent;"
        >
          <owner-list-item :owner="application.owner" />

          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-file-image</v-icon>
            </v-list-item-avatar>
            <span>{{ prodBaseApp ? prodBaseApp.title : application.url.split('/').slice(-3,-2).pop() }}</span>
            &nbsp;<span>- {{ $t('version') }} {{ version }}</span>
            <v-spacer />
            <span
              v-if="upgradeAvailable"
              v-t="{path: 'availableVersion', args: {version: upgradeAvailable.version}}"
              class="accent--text"
            />
          </v-list-item>

          <!--<v-list-item
            v-if="journal[0]"
            :class="'event-' + journal[0].type"
          >
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>{{ events[journal[0].type].icon }}</v-icon>
            </v-list-item-avatar>
            <span>{{ events[journal[0].type].text }}</span>
          </v-list-item>-->
          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-pencil</v-icon>
            </v-list-item-avatar>
            <span>{{ application.updatedBy.name }} {{ application.updatedAt | moment("lll") }}</span>
          </v-list-item>
          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-plus-circle-outline</v-icon>
            </v-list-item-avatar>
            <span>{{ application.createdBy.name }} {{ application.createdAt | moment("lll") }}</span>
          </v-list-item>
          <v-list-item v-if="dataset">
            <nuxt-link
              :to="`/dataset/${dataset.id}`"
              style="text-decoration:none"
              class="mr-2"
            >
              <v-list-item-avatar class="ml-0 my-0">
                <v-icon>mdi-database</v-icon>
              </v-list-item-avatar>
              <a>{{ dataset.title }}</a>
            </nuxt-link>
            <dataset-btn-table :dataset="dataset" />
          </v-list-item>
        </v-list>
      </v-sheet>
      <v-select
        v-if="topics && topics.length"
        v-model="application.topics"
        :disabled="!can('writeDescription')"
        :items="topics"
        item-text="title"
        item-key="id"
        :label="$t('topics')"
        multiple
        return-object
        @input="patch({topics: application.topics})"
      />
    </v-col>
    <v-col
      cols="12"
      md="6"
      lg="7"
      order-md="1"
    >
      <v-text-field
        v-model="application.title"
        :disabled="!can('writeDescription')"
        label="Titre"
        @change="patch({title: application.title})"
      />
      <markdown-editor
        v-model="application.description"
        :disabled="!can('writeDescription')"
        label="Description"
        @change="patch({description: application.description})"
      />
      <v-text-field
        id="slug-input"
        v-model="application.slug"
        :readonly="true"
        :disabled="!can('writeDescriptionBreaking')"
        :label="$t('slug')"
        outlined
        dense
        hide-details
        class="mb-3"
      />
      <v-menu
        v-if="can('writeDescription')"
        v-model="slugMenu"
        activator="#slug-input"
        offset-y
        :close-on-content-click="false"
        max-width="700"
        @input="newSlug = application.slug"
      >
        <v-card>
          <v-card-title primary-title>
            {{ $t('slug') }}
          </v-card-title>
          <v-card-text>
            <v-alert
              type="warning"
              outlined
            >
              {{ $t('slugWarning') }}
            </v-alert>
            <v-text-field
              v-model="newSlug"
              :label="$t('newSlug')"
              autofocus
              outlined
              dense
              hide-details
              :required="true"
              :rules="[(val) => !!val]"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              v-t="'cancel'"
              text
              @click="slugMenu = false"
            />
            <v-btn
              v-t="'validate'"
              color="warning"
              :disabled="newSlug === application.slug || !newSlug"
              @click="patchAndCommit({slug: newSlug}); slugMenu = false"
            />
          </v-card-actions>
        </v-card>
      </v-menu>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  version: version
  availableVersion: Version {version} disponible
  unknown: inconnue
  test: de test
  topics: Thématiques
  title: Titre
  slug: Identifiant de publication
  slugWarning: Cet identifiant unique et lisible est utilisé dans les URLs de pages de portails, codes d'intégration, etc. Attention, si vous le modifiez vous pouvez casser des liens.
  newSlug: Nouvel identifiant de publication
en:
  version: version
  availableVersion: Version {version} available
  unknown: unknown
  test: test
  topics: Topics
  title: Title
  slug: Publication identifier
  slugWarning: "This unique and readable id is used in portal pages URLs, integration codes, etc. Warning : if you modify it you can break existing links."
  newSlug: New publication identifier
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  data () {
    return {
      slugMenu: false,
      newSlug: ''
    }
  },
  computed: {
    ...mapState('application', ['application', 'journal', 'prodBaseApp']),
    ...mapGetters('application', ['can', 'availableVersions']),
    topics () {
      return this.$store.getters.ownerTopics(this.application.owner)
    },
    dataset () {
      let dataset
      if (this.application.configuration && this.application.configuration.datasets && this.application.configuration.datasets.length) {
        dataset = JSON.parse(JSON.stringify(this.application.configuration.datasets[0]))
      } else if (this.application.configurationDraft && this.application.configurationDraft.datasets && this.application.configurationDraft.datasets.length) {
        dataset = JSON.parse(JSON.stringify(this.application.configurationDraft.datasets[0]))
      }
      if (dataset && !dataset.id) {
        dataset.id = dataset.href.split('/').pop()
      }
      return dataset
    },
    version () {
      if (!this.prodBaseApp || !this.prodBaseApp.version) return this.$t('unknown')
      else if (this.prodBaseApp.version === 'master' || this.prodBaseApp.version === 'latest') return this.$t('test')
      else return this.prodBaseApp.version
    },
    upgradeAvailable () {
      return this.availableVersions && this.availableVersions.length && this.availableVersions[0].version !== this.prodBaseApp.version && this.availableVersions[0]
    }
  },
  mounted () {
    this.$store.dispatch('fetchTopics', this.application.owner)
  },
  methods: {
    ...mapActions('application', ['patch', 'patchAndCommit'])
  }
}
</script>

<style lang="css">
</style>
