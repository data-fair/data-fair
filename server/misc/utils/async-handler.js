// small route wrapper for better use of async/await with express
/**
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void | import('express').Response>} handler
 * @param {{keepalive?: boolean}} options
 * @returns {import('express').RequestHandler}
 */
module.exports = (handler, options = {}) => {
  return (req, res, next) => {
    // kinda hackish way of keeping a http request opened in the case where it takes a long time to process
    // ideally all long tasks should be performed in a worker instead but this a temporary workaround
    // to prevent 504 gateway timeouts

    /** @type {NodeJS.Timeout} */
    let keepaliveInterval
    if (options.keepalive) {
      keepaliveInterval = setInterval(() => {
        if (res.headersSent) res.write(' ')
      }, 1000)
      res.send = (result) => {
        res.write(JSON.stringify(result, null, 2))
        res.end()
        return res
      }
    }
    return handler(req, res, next).catch(next).then(() => {
      if (keepaliveInterval) clearInterval(keepaliveInterval)
    })
  }
}
