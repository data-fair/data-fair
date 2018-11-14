const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const debug = require('debug')('capture')
const puppeteer = require('puppeteer')

exports.init = async () => {
  await fs.ensureDir(path.join(config.dataDir, 'captures'))
  return puppeteer.launch()
}

exports.path = (application) => {
  return path.resolve(config.dataDir, 'captures', application.id + '.png')
}

exports.screenshot = async (req) => {
  if (!puppeteer) return
  try {
    const browser = req.app.get('browser')
    const page = await browser.newPage()
    const appUrl = `${config.publicUrl}/app/${req.application.id}`
    await page.setCookie(
      { name: 'id_token', value: req.cookies.id_token, url: appUrl },
      { name: 'id_token_sign', value: req.cookies.id_token_sign, url: appUrl }
    )
    await page.setViewport({ width: 800, height: 450 })
    await page.goto(appUrl)
    debug('Capture screenshot', exports.path(req.application))
    await page.screenshot({ path: exports.path(req.application) })
    await page.close()
  } catch (err) {
    // catch err locally as this method is called without waiting for result
    console.error(`Failed to capture screenshot for application ${req.application.id}`, err)
  }
}
