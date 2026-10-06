import { type DatasetExt } from '#api/types'

export const datasetListSelect = 'id,title,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,count,finalizedAt,partOf,-userPermissions,-links,-owner'

export type ListedDataset = Omit<DatasetExt, 'description' | 'schema' >
