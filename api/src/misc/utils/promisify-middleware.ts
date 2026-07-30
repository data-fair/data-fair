export default (midleware: any, reqProperty: any) => {
  return async (req: any, res: any) => new Promise((resolve, reject) => {
    midleware(req, res, (err: any) => {
      if (err) return reject(err)
      resolve(req[reqProperty])
    })
  })
}
