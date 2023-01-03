<template>
  <iframe
    src="http://localhost:5600/data-fair/embed/dataset/test-sirene-vannes/table"
    width="100%"
    height="500px"
    scrolling="no"
  />
  <!--<iframe
    src="https://airtable.com/embed/shrwhXaERZRqXkdGG/tblYZhp54wOJnTu8K/viwgRTiBkh7PHEOnC?blocks=bipy5UAfZe9Pcm7rA"
    width="100%"
    height="500px"
    scrolling="no"
  />-->
</template>

<script>
export default {
  layout: 'embed',
  mounted () {
    window.vIframeOptions = { router: this.$router }
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
