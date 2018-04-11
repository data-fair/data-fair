function getStatus(callback) {
  callback(null, {
    status: 'ok',
    message: 'Service is ok',
    details: 'Service is ok'
  })
}

exports.status = (req, res, next) => {
  getStatus((err, status) => {
    if (err) return next(err)
    res.send(status)
  })
}

exports.ping = (req, res, next) => {
  getStatus((err, status) => {
    if (err) return next(err)
    if (status.status === 'error') res.status(500).send(status)
    else res.send(status.status)
  })
}
