<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90" v-if="dataset">
    <md-tabs md-fixed class="md-transparent">
      <md-tab md-label="Métadonnées" md-icon="toc">
        <md-layout md-row>
          <md-layout md-column md-flex="50">
            <md-input-container>
              <label>Titre</label>
              <md-input v-model="dataset.title" @blur="save"></md-input>
            </md-input-container>
            <md-input-container>
              <label>Description</label>
              <md-textarea v-model="dataset.description" @blur="save"></md-textarea>
            </md-input-container>
          </md-layout>
          <md-layout md-column md-flex="40" md-flex-offset="10">
            <md-card>
              <md-list>
                <md-list-item>
                  <md-icon>insert_drive_file</md-icon> <span>{{dataset.file.name}}</span> <span>{{(dataset.file.size / 1024).toFixed(2)}} ko</span>
                </md-list-item>
                <md-list-item>
                  <md-icon>update</md-icon> <span>{{dataset.updatedBy}}</span> <span>{{dataset.updatedAt | moment("DD/MM/YYYY, HH:mm")}}</span>
                </md-list-item>
                <md-list-item>
                  <md-icon>add_circle_outline</md-icon> <span>{{dataset.createdBy}}</span> <span>{{dataset.createdAt | moment("DD/MM/YYYY, HH:mm")}}</span>
                </md-list-item>
              </md-list>
            </md-card>
          </md-layout>
        </md-layout>
      </md-tab>

      <md-tab md-label="Vue tableau" md-icon="view_list">
        <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Deserunt dolorum quas amet cum vitae, omnis! Illum quas voluptatem, expedita iste, dicta ipsum ea veniam dolore in, quod saepe reiciendis nihil.</p>
      </md-tab>

      <!-- <md-tab md-label="Permissions" md-icon="security">
        <permissions :dataset="dataset" @change="save"></permissions>
      </md-tab> -->


      <md-tab md-label="Journal" md-icon="event_note">
        <journal :dataset="dataset"></journal>
      </md-tab>
    </md-tabs>
  </md-layout>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')
import Permissions from '../components/Permissions.vue'
import Journal from '../components/Journal.vue'

export default {
  name: 'dataset',
  components: {
    Permissions,
    Journal
  },
  data: () => ({
    dataset: null
  }),
  computed: mapState({
    user: state => state.user
  }),
  mounted() {
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId).then(result => {
      this.dataset = result.data
    })
  },
  methods: {
    save() {
      this.$http.put(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId, this.dataset).then(result => {
        this.dataset = result.data
      })
    }
  }
}
</script>
