// small route wrapper for better use of async/await with express
module.exports = route => {
  return (req, res, next) => route(req, res, next).catch(next)
}
