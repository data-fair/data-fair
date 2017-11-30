<template>
<div>
  <h3 class="md-headline">Visibilité</h3>
  <md-switch v-model="dataset.public" @change="$emit('toggle-visibility')">Public (visible par tous)</md-switch>
  <!-- <h3 class="md-headline">Permissions</h3>
  <md-table>
    <md-table-header>
      <md-table-row>
        <md-table-head>Personne ou organisation</md-table-head>
        <md-table-head>Nom</md-table-head>
        <md-table-head>Mode</md-table-head>
      </md-table-row>
    </md-table-header>

    <md-table-body>
      <md-table-row>
        <md-table-cell>
          <md-select v-model="newPermission.type">
            <md-option value="organization">Organisation</md-option>
            <md-option value="user">Personne</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-select v-model="newPermission.id">
            <md-option value="organization">Organisation</md-option>
            <md-option value="user">Personne</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-select v-model="newPermission.mode">
            <md-option value="read">Lecture</md-option>
            <md-option value="write">Lecture / Ecriture</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-button class="md-icon-button md-raised md-primary">
            <md-icon>add</md-icon>
          </md-button>
        </md-table-cell>
      </md-table-row>
      <md-table-row v-for="(permission, rowIndex) in dataset.permissions" :key="rowIndex">
        <md-table-cell>
          <md-select v-model="permission.type">
            <md-option value="organization">Organisation</md-option>
            <md-option value="user">Personne</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-select v-model="permission.id">
            <md-option value="organization">Organisation</md-option>
            <md-option value="user">Personne</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-select v-model="permission.mode">
            <md-option value="read">Lecture</md-option>
            <md-option value="write">Lecture / Ecriture</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-button class="md-icon-button md-raised md-warn">
            <md-icon>remove</md-icon>
          </md-button>
        </md-table-cell>
      </md-table-row>
    </md-table-body>
  </md-table>
  <h3 class="md-headline">Transférer la propriété</h3> -->

</div>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'permissions',
  props: ['dataset'],
  data: () => ({
    newPermission: {
      type: 'organization',
      id: null,
      mode: 'read'
    },
    organizations: {},
    users: {}
  }),
  mounted() {
    this.dataset.permissions = this.dataset.permissions || []
    this.$http.get(window.CONFIG.directoryUrl + '/api/organizations').then(results => {
      this.organizations = Object.assign({}, ...results.data.results.map(organization => ({
        [organization.id]: organization
      })))
    })
    this.$http.get(window.CONFIG.directoryUrl + '/api/users').then(results => {
      this.users = Object.assign({}, ...results.data.results.map(user => ({
        [user.id]: user
      })))
    })
  },
  watch: {
    dataset() {
      this.dataset.permissions = this.dataset.permissions || []
    }
  }
}
</script>
