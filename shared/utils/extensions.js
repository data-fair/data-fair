exports.getExtensionKey = (extension) => {
  if (extension.propertyPrefix) return extension.propertyPrefix
  // deprecated
  if (extension.shortId) return '_ext_' + extension.shortId
  // also deprecated
  return `_ext_${extension.remoteService}_${extension.action}`
}
