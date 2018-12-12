const fs = require('fs-extra')
const path = require('path')
const exec = require('child-process-promise').exec
const datasetUtils = require('./dataset')

exports.downloadAttachment = (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send()
  res.download(path.resolve(datasetUtils.attachmentsDir(req.dataset), filePath))
}

exports.addAttachments = async (dataset, attachmentsFile) => {
  const dir = datasetUtils.attachmentsDir(dataset)
  await fs.ensureDir(dir)
  await exec(`unzip -o -q ${attachmentsFile.path} -d ${dir}`)
  await fs.remove(attachmentsFile.path)
}

exports.replaceAllAttachments = async (dataset, attachmentsFile) => {
  const dir = datasetUtils.attachmentsDir(dataset)
  await fs.ensureDir(dir)
  await fs.emptyDir(dir)
  await exec(`unzip -o -q ${attachmentsFile.path} -d ${dir}`)
  await fs.remove(attachmentsFile.path)
}
