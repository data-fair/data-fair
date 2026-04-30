# Correction du filtrage propriétaire et ajout du toggle super admin

## Contexte

Depuis la migration de ui-legacy vers ui, le filtre propriétaire dans les pages de listing des jeux de données et applications affiche tous les propriétaires de la plateforme (via les facettes API qui incluent les datasets publics d'autres organisations). Cela donne l'impression d'être en mode super admin. De plus, le toggle "voir tous les jeux de données" pour les super admins a disparu lors de la migration.

## Approche retenue

**Filtrage frontend uniquement** : on filtre les facettes `owner` retournées par l'API côté frontend pour ne garder que les entrées pertinentes. Pas de changement backend - les permissions et facettes API fonctionnent déjà correctement.

## Comportement par profil

| Profil | Vue par défaut | Filtre propriétaire | Toggle showAll |
|--------|---------------|---------------------|----------------|
| Utilisateur de département | JDD de son département | Aucun (caché) | Non |
| Admin org (sans département) | Tous les JDD de l'org | Départements de l'org + "Aucun département" | Non |
| Super admin (toggle OFF) | Tous les JDD de l'org | Départements de l'org + "Aucun département" | Visible (OFF) |
| Super admin (toggle ON) | Tous les JDD plateforme | Toutes les orgs/départements avec agrégation | Visible (ON) |

## Labels du filtre propriétaire

### Mode normal (admin org / super admin toggle OFF)

Facettes filtrées pour ne garder que `f.value.type === account.type && f.value.id === account.id` :

- `Département Marketing (12)` - label = `departmentName`, valeur = `organization:orgId:deptId`
- `Aucun département (5)` - label = `"Aucun département"`, valeur = `organization:orgId:-`

Le filtre n'apparaît que si `ownerItems.length > 1` (comportement existant).

### Mode super admin (toggle ON)

Toutes les facettes, regroupées par organisation :

Pour une org **avec** départements (>1 entrée ou entrées avec department) :
- `Org Alpha (25)` - agrégé (somme counts), valeur = `organization:orgA:*`
- `Org Alpha - Marketing (12)` - valeur = `organization:orgA:marketing`
- `Org Alpha - Aucun département (5)` - valeur = `organization:orgA:-`

Pour une org **sans** départements (1 seule entrée sans department) :
- `Org Beta (10)` - valeur = `organization:orgB:-`

## Fichiers à modifier

### 1. `ui/src/pages/datasets/index.vue`

- Ajouter `const showAll = useStringSearchParam('showAll')` lié à l'URL
- Ajouter un `v-switch` dans `df-navigation-right`, au-dessus des facets :
  ```vue
  <v-switch
    v-if="session.state.user?.adminMode"
    v-model="showAllToggle"
    color="admin"
    class="mx-4 text-admin"
    :label="t('showAll')"
    hide-details
  />
  ```
- Modifier `ownerParam` :
  ```typescript
  const ownerParam = computed(() => {
    if (facetOwner.value?.length) return facetOwner.value.join(',')
    if (showAll.value === 'true') return undefined
    const a = account.value
    if (!a) return undefined
    let o = a.type + ':' + a.id
    if (a.department) o += ':' + a.department
    return o
  })
  ```
- Modifier `showOwner` : `const showOwner = computed(() => !!facetOwner.value?.length || showAll.value === 'true')`
- Passer `showAll` et `account` aux facettes : `<dataset-facets :show-all="showAll === 'true'" :account="account" ... />`
- Cacher les facettes propriétaire si `account.department` (géré dans le composant facets via la condition `ownerItems.length > 1`)

### 2. `ui/src/pages/applications/index.vue`

Mêmes modifications que pour datasets.

### 3. `ui/src/components/dataset/dataset-facets.vue`

- Ajouter props `showAll: boolean` et `account: Account | null`
- Modifier la construction de `ownerItems` :
  ```typescript
  const ownerItems = computed(() => {
    const values = props.facets.owner
    if (!values?.length) return []

    if (!props.showAll && props.account) {
      // Mode normal : filtrer par org courante
      const orgFacets = values.filter(f =>
        f.value.type === props.account!.type && f.value.id === props.account!.id
      )
      return orgFacets.map(f => ({
        title: (f.value.department
          ? (f.value.departmentName || f.value.department)
          : t('noDepartment')) + ` (${f.count})`,
        value: `${f.value.type}:${f.value.id}:${f.value.department || '-'}`
      }))
    }

    // Mode super admin (showAll) : regrouper par org
    const byOrg = new Map<string, typeof values>()
    for (const f of values) {
      const key = `${f.value.type}:${f.value.id}`
      if (!byOrg.has(key)) byOrg.set(key, [])
      byOrg.get(key)!.push(f)
    }

    const items: { title: string, value: string }[] = []
    for (const [orgKey, orgFacets] of byOrg) {
      const orgName = orgFacets[0].value.name || orgFacets[0].value.id
      const hasDepartments = orgFacets.some(f => f.value.department)

      if (!hasDepartments) {
        // Org sans départements
        const total = orgFacets.reduce((s, f) => s + f.count, 0)
        items.push({
          title: `${orgName} (${total})`,
          value: `${orgKey}:-`
        })
      } else {
        // Org avec départements : option agrégée + sous-items
        const total = orgFacets.reduce((s, f) => s + f.count, 0)
        items.push({
          title: `${orgName} (${total})`,
          value: `${orgKey}:*`
        })
        for (const f of orgFacets) {
          const label = f.value.department
            ? `${orgName} - ${f.value.departmentName || f.value.department}`
            : `${orgName} - ${t('noDepartment')}`
          items.push({
            title: `${label} (${f.count})`,
            value: `${f.value.type}:${f.value.id}:${f.value.department || '-'}`
          })
        }
      }
    }
    return items
  })
  ```
- Ajouter traduction `noDepartment: "Aucun département"` / `"No department"`

### 4. `ui/src/components/application/application-facets.vue`

Mêmes modifications que pour dataset-facets.

## Vérification

1. **Utilisateur de département** : vérifier que seuls les JDD du département sont visibles, pas de filtre propriétaire
2. **Admin org sans département** : vérifier que les JDD de toute l'org sont visibles, le filtre montre les départements + "Aucun département", pas d'orgs extérieures
3. **Super admin toggle OFF** : même comportement que admin org + toggle visible
4. **Super admin toggle ON** : tous les JDD de la plateforme visibles, filtre montre toutes les orgs avec regroupement par département
5. **Même vérification pour les applications**
