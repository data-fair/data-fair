import type { ComputedRef, Ref } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { unwrapFilterQuery } from '@data-fair/agent-tools-data-fair/_utils'
import { createAgentTranslator } from './utils'
import { toAbsoluteUrl, toRoutePath } from './url-utils'
import type { NavGroup } from '~/composables/layout/use-navigation-items'
import type { BreadcrumbItem } from '~/composables/layout/use-breadcrumbs'

const messages: Record<string, Record<string, string>> = {
  fr: {
    getCurrentLocation: 'Obtenir la localisation actuelle',
    listPages: 'Lister les pages',
    navigateToPage: 'Naviguer vers une page'
  },
  en: {
    getCurrentLocation: 'Get current location',
    listPages: 'List pages',
    navigateToPage: 'Navigate to page'
  }
}

interface AgentNavigationToolsDeps {
  route: RouteLocationNormalizedLoaded
  router: Router
  navigationGroups: ComputedRef<NavGroup[]>
  breadcrumbItems: Ref<BreadcrumbItem[]>
  locale: Ref<string>
}

export function useAgentNavigationTools ({ route, router, navigationGroups, breadcrumbItems, locale }: AgentNavigationToolsDeps) {
  const t = createAgentTranslator(messages, locale)

  // Absolute application URL for a router path (or {id} template). Tools run in the
  // main frame, so window.location.origin is the Data Fair app origin, and the router
  // history base carries the deployment path prefix (e.g. /data-fair/).
  const appUrl = (path: string) => toAbsoluteUrl(window.location.origin, router.options.history.base, path)

  useAgentTool({
    name: 'get_current_location',
    description: 'Get the current page location in the application, including its full URL, route path, name, parameters, and breadcrumbs.',
    annotations: { title: t('getCurrentLocation'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      const breadcrumbs = breadcrumbItems.value.map(b => `- ${b.text}: ${typeof b.to === 'string' ? appUrl(b.to) : b.to?.path ? appUrl(b.to.path) : ''}`).join('\n')
      return {
        content: [{
          type: 'text' as const,
          text: `**URL**: ${appUrl(route.fullPath)}\n**Path**: ${route.path}\n**Name**: ${route.name as string}\n**Params**: ${JSON.stringify({ ...route.params })}\n**Query**: ${JSON.stringify({ ...route.query })}\n**Breadcrumbs**:\n${breadcrumbs}`
        }]
      }
    }
  })

  useAgentTool({
    name: 'list_pages',
    description: 'List all available pages in the application that the current user can access, organized by group (content, management, connectors, monitoring, help, admin). Returns full absolute URLs — use them verbatim when writing links; substitute {id} and append `?<query>` for filtered views, but never alter the origin or path prefix.',
    annotations: { title: t('listPages'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      const pagesByGroup = navigationGroups.value.reduce((acc, group) => {
        const items = group.items.filter(item => item.to).map(item => `- ${item.title}${item.subtitle ? ` (${item.subtitle})` : ''}: ${typeof item.to === 'string' ? appUrl(item.to) : item.to}`)
        if (items.length > 0) {
          acc.push(`**${group.title}**:\n${items.join('\n')}`)
        }
        return acc
      }, [] as string[])

      pagesByGroup.push(
        '**Workflow pages**:\n' +
        `- Create new dataset: ${appUrl('/new-dataset')}\n` +
        `- Update existing dataset: ${appUrl('/update-dataset')}\n` +
        `- Share/publish dataset: ${appUrl('/share-dataset')}\n` +
        `- Create new application: ${appUrl('/new-application')}`
      )

      pagesByGroup.push(
        '**Detail pages** (require an ID, use list_datasets or list_applications to find IDs):\n' +
        `- Dataset overview: ${appUrl('/dataset/{id}')}\n` +
        `- Dataset data: ${appUrl('/dataset/{id}/data')}\n` +
        `- Dataset table: ${appUrl('/dataset/{id}/table')} — accepts filter query params (same format as search_data filters: column_key + suffix like nom_search, age_lte, ville_eq). Also accepts _c_q (full-text search), sort, select, _c_bbox, _c_geo_distance, _c_date_match. The \`_c_\` prefix on q/bbox/geo_distance/date_match is required for URL sync — never put \`_c_\` on column filters (use nom_search, not _c_nom_search). Use the filterQuery from dataset_data subagent Context directly as the query parameter.\n` +
        `- Dataset map: ${appUrl('/dataset/{id}/map')} — for geolocalized datasets, accepts the same filter query params as the table page\n` +
        `- Dataset files: ${appUrl('/dataset/{id}/files')}\n` +
        `- Edit dataset data: ${appUrl('/dataset/{id}/edit-data')}\n` +
        `- Edit dataset metadata: ${appUrl('/dataset/{id}/edit-metadata')}\n` +
        `- Edit dataset schema: ${appUrl('/dataset/{id}/edit-schema')}\n` +
        `- Dataset thumbnails: ${appUrl('/dataset/{id}/thumbnails')}\n` +
        `- Dataset revisions: ${appUrl('/dataset/{id}/revisions')}\n` +
        `- Dataset API doc: ${appUrl('/dataset/{id}/api-doc')}\n` +
        `- Application overview: ${appUrl('/application/{id}')}\n` +
        `- Application config: ${appUrl('/application/{id}/config')}\n` +
        `- Application API doc: ${appUrl('/application/{id}/api-doc')}\n` +
        `- Remote service detail: ${appUrl('/remote-service/{id}')}\n` +
        `- Remote service API doc: ${appUrl('/remote-service/{id}/api-doc')}`
      )

      pagesByGroup.push(
        '**D-frame pages** (processings/catalogs, use list_processings or list_catalogs to find IDs):\n' +
        `- Processings list: ${appUrl('/processings')}\n` +
        `- Processing detail: ${appUrl('/processings/{id}')}\n` +
        `- Catalogs list: ${appUrl('/catalogs')}\n` +
        `- Catalog detail: ${appUrl('/catalogs/{id}')}`
      )

      return {
        content: [{
          type: 'text' as const,
          text: pagesByGroup.join('\n')
        }]
      }
    }
  })

  useAgentTool({
    name: 'navigate',
    description: 'Navigate to a page in the application. Accepts either a full absolute URL (as returned by list_pages, get_current_location, or the page field of dataset/application tools) or a bare path — both work. Use list_datasets, list_applications, list_processings, or list_catalogs to find resource IDs. Optionally pass query parameters. IMPORTANT: when you search or filter data from a dataset, always offer to navigate the user to the filtered table view by passing the same filter parameters as query params to the dataset table page.',
    annotations: { title: t('navigateToPage') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string' as const,
          description: 'The destination, either a full absolute URL (e.g. the page field returned by list_datasets) or a path (e.g. "/datasets", "/dataset/abc123", "/dataset/abc123/table"). Both are accepted.'
        },
        query: {
          type: 'string' as const,
          description: 'Optional query string to append to the URL (without leading "?"). For dataset table pages, use the filterQuery from the dataset_data subagent Context. Example: "nom_search=Jean&age_lte=30&_c_q=Paris" (note: column filters like nom_search have no _c_ prefix; only q/bbox/geo_distance/date_match do).'
        }
      },
      required: ['path'] as const
    },
    execute: async (params) => {
      try {
        // Accept a full absolute URL, a base-prefixed path, or a bare router path.
        const { path, query: embeddedQuery } = toRoutePath(window.location.origin, router.options.history.base, params.path)
        const queryString = unwrapFilterQuery(params.query as string | undefined) || embeddedQuery
        const query = queryString ? Object.fromEntries(new URLSearchParams(queryString)) : undefined
        await router.push(query ? { path, query } : path)
        await new Promise(resolve => setTimeout(resolve, 500))
        const currentRoute = router.currentRoute.value
        return {
          content: [{
            type: 'text' as const,
            text: `**Success**: true\n**New Path**: ${currentRoute.path}\n**Query**: ${JSON.stringify({ ...currentRoute.query })}`
          }]
        }
      } catch (error: any) {
        return {
          content: [{
            type: 'text' as const,
            text: `**Success**: false\n**Error**: ${error.message}`
          }],
          isError: true
        }
      }
    }
  })
}
