<script setup lang="ts">
const route = useRoute()
const router = useRouter()
router.replace(`/application/${route.params.id}`)
</script>
