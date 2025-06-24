import { type DatasetExt } from '#api/types'

export const datasetListSelect = 'id,title,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner'

export type ListedDataset = Omit<DatasetExt, 'description' | 'schema' >
