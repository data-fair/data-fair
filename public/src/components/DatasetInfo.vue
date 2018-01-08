<template lang="html">
  <div>
    <h3 class="md-headline">Informations</h3>
    <md-layout md-row>
      <md-layout md-column md-flex="45">
        <md-input-container>
          <label>Titre</label>
          <md-input v-model="dataset.title" @blur="save"/>
        </md-input-container>
        <md-input-container>
          <label>Description</label>
          <md-textarea v-model="dataset.description" @blur="save"/>
        </md-input-container>
        <md-input-container>
          <label>Licence</label>
          <md-select v-model="license" @change="changeLicense">
            <md-option :value="license.href" v-for="(license, i) in licenses" :key="i">{{ license.title }}</md-option>
          </md-select>
        </md-input-container>
      </md-layout>
      <md-layout md-column md-flex="45" md-flex-offset="10">
        <md-card>
          <md-list>
            <md-list-item>
              <md-icon>insert_drive_file</md-icon> <span>{{ dataset.file.name }}</span> <span>{{ (dataset.file.size / 1024).toFixed(2) }} ko</span>
            </md-list-item>
            <md-list-item>
              <md-icon>update</md-icon>
              <user-name :user="usersInfo[dataset.updatedBy]"/> <span>{{ dataset.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </md-list-item>
            <md-list-item>
              <md-icon>add_circle_outline</md-icon>
              <user-name :user="usersInfo[dataset.createdBy]"/> <span>{{ dataset.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </md-list-item>
          </md-list>
        </md-card>
      </md-layout>
    </md-layout>
  </div>
</template>

<script>
import UserName from './UserName.vue'
const {mapState} = require('vuex')
const store = require('../store')

export default {
  components: {UserName},
  props: ['dataset'],
  data() {
    return {
      license: null
    }
  },
  computed: {
    ...mapState(['usersInfo']),
    licenses() {
      return store.getters.ownerLicenses(this.dataset.owner)
    }
  },
  mounted() {
    // Hack to work around object binding to md-select
    if (this.dataset.license && this.dataset.license.href) this.license = this.dataset.license.href
    store.dispatch('fetchLicenses', this.dataset.owner)
    store.dispatch('fetchUsers', [this.dataset.createdBy, this.dataset.updatedBy])
  },
  methods: {
    save() {
      this.$emit('changed')
    },
    changeLicense() {
      // Hack to work around object binding to md-select
      if (this.license) this.dataset.license = this.licenses.find(l => l.href === this.license)
      this.save()
    }
  }
}
</script>

<style lang="css">
</style>
