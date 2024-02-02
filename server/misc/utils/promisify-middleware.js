module.exports = (midleware, reqProperty) => {
  return async (req, res) => new Promise((resolve, reject) => {
    midleware(req, res, (err) => {
      if (err) return reject(err)
      resolve(req[reqProperty])
    })
  })
}
