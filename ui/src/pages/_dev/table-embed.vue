<template>
  <div>
    <v-text-field
      v-model="q"
      label="recherche depuis la page parente"
    />
    <v-text-field
      v-model="libDep"
      label="libellé départment"
    />
    <v-iframe
      src="http://localhost:5600/data-fair/embed/dataset/av926b83xz89sp3seba9f54q/table"
      :query-params-extra="{ q, libelle_departement_eq: libDep}"
    />
  <!--<iframe
    src="https://airtable.com/embed/shrwhXaERZRqXkdGG/tblYZhp54wOJnTu8K/viwgRTiBkh7PHEOnC?blocks=bipy5UAfZe9Pcm7rA"
    width="100%"
    height="500px"
    scrolling="no"
  />-->
  </div>
</template>

<script>
import VIframe from '@koumoul/v-iframe'

export default {
  components: { VIframe },
  layout: 'embed',
  data: () => ({
    q: '',
    libDep: ''
  }),
  mounted () {
    // window.vIframeOptions = { router: this.$router }
    console.log('extra1')
    parent.postMessage({
      breadcrumbs: [{
        text: 'Extra page'
      }]
    })
  }
}
</script>

<style lang="css" scoped>
</style>
