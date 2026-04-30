import { getStatus } from '../../admin/service.ts'

export const status = async (req, res, next) => {
  const result = await getStatus(req)
  res.send(result)
}

export const ping = async (req, res, next) => {
  const result = await getStatus(req)
  if (result.status === 'error') res.status(500)
  res.send(result.status)
}
