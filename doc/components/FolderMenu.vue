<template lang="html">
  <v-list
    dense
    expand
  >
    <template v-for="(chapter, i) in chapters">
      <v-list-group
        :key="chapter.id"
        no-action
        :value="i === 0"
      >
        <v-list-item
          slot="activator"
          :to="localePath({name: chapter.id})"
          nuxt
          exact
        >
          <!-- <v-list-item-action>
                  <v-icon>mdi-information-outline</v-icon>
                </v-list-item-action> -->
          <v-list-item-title>
            {{ $t(chapter.id) }}
          </v-list-item-title>
        </v-list-item>
        <template v-for="section in content.filter(c => c.chapter === chapter.id && !c.subsection)">
          <v-list-item
            v-if="!content.filter(c => c.chapter === chapter.id && c.section == section.section && c.subsection).length"
            :key="section.id"
            :to="localePath({name: `${chapter.id}-id`, params: {id: section.id}})"
          >
            <v-list-item-title>
              {{ section.title || section.id }}
              <v-icon
                v-if="!section.published"
                color="error"
                small
              >
                mdi-alert
              </v-icon>
            </v-list-item-title>
          </v-list-item>

          <v-list-group
            v-else
            :key="section.id"
            no-action
            sub-group
          >
            <v-list-item
              slot="activator"
              :to="localePath({name: `${chapter.id}-id`, params: {id: section.id}})"
              nuxt
            >
              <v-list-item-title>
                {{ section.title }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item
              v-for="subsection in content.filter(c => c.chapter === chapter.id && c.section == section.section && c.subsection)"
              :key="subsection.id"
              :to="localePath({name: `${chapter.id}-id`, params: {id: subsection.id}})"
            >
              <v-list-item-title>
                {{ subsection.title }}
                <v-icon
                  v-if="!subsection.published"
                  color="error"
                  small
                >
                  mdi-alert
                </v-icon>
              </v-list-item-title>
            </v-list-item>
          </v-list-group>
        </template>
      </v-list-group>
    </template>
  </v-list>
</template>

<i18n locale="fr" lang="yaml" src="../i18n/common-fr.yaml"></i18n>
<i18n locale="en" lang="yaml" src="../i18n/common-en.yaml"></i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: ['folder'],
  computed: {
    ...mapState(['chapters']),
    ...mapGetters(['navContent']),
    content () {
      return this.navContent(this.$i18n.locale)
    }
  }
}
</script>
