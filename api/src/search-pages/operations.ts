import type { PostSearchPage } from '@data-fair/types-portals'
import { isPublic, getPrivateAccess, type AccessAccountRef } from '../misc/utils/permissions.ts'

export { isPublic, getPrivateAccess, type AccessAccountRef }

type Account = {
  type: 'user' | 'organization'
  id: string
  name: string
  department?: string
  departmentName?: string
}

export const buildPostSearchPage = (
  resourceType: 'datasets' | 'applications',
  resource: { id: string; owner: Account; permissions?: any[] },
  portal: string,
  indexingStatus: 'toIndex' | 'toDelete'
): PostSearchPage => {
  const publicAccess = isPublic(resourceType, resource)
  return {
    portal,
    owner: resource.owner,
    resource: {
      type: resourceType === 'datasets' ? 'dataset' : 'application',
      id: resource.id
    },
    public: publicAccess,
    privateAccess: publicAccess ? undefined : getPrivateAccess(resourceType, resource),
    indexingStatus
  }
}

export const extractPortalId = (publicationSite: string): string | null => {
  const parts = publicationSite.split(':')
  if (parts.length !== 2) return null
  const [, portalId] = parts
  return portalId
}
