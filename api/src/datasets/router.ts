import express from 'express'
import { setReqResourceType } from '../misc/utils/permissions.ts'
import { registerMasterDataRoutes } from './routes/master-data.ts'
import { registerReadRoutes } from './routes/read.ts'
import { registerLinesRoutes } from './routes/lines.ts'
import { registerOwnLinesRoutes } from './routes/own-lines.ts'
import { registerFilesRoutes } from './routes/files.ts'
import { registerMetadataRoutes } from './routes/metadata.ts'
import { registerWriteRoutes } from './routes/write.ts'
import { registerMiscRoutes } from './routes/misc.ts'

const router = express.Router()

router.use((req, res, next) => {
  setReqResourceType(req, 'datasets')
  next()
})

registerMetadataRoutes(router)

registerWriteRoutes(router)

registerLinesRoutes(router)

registerOwnLinesRoutes(router)

registerMasterDataRoutes(router)

registerReadRoutes(router)

registerFilesRoutes(router)

registerMiscRoutes(router)

export default router
