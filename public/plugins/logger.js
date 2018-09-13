import logger from '../logger'

export default ({env, route}) => {
  const logLevel = (route.query.log || env.browserLogLevel)
  logger.setLevel(logLevel)
  logger.error('HAHA')
  logger.warn('warn')
  logger.debug('debug')
}
