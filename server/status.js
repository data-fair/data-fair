function getStatus(callback) {
  callback({
    status: 'ok',
    message: 'Service is ok',
    details: 'Service is ok'
  })
}

exports.status = (req, res) => {
  getStatus(status => res.send(status))
}

exports.ping = (req, res) => {
  getStatus(status => {
    if (status.status === 'error') res.status(500).send(status)
    else res.send(status.status)
  })
}
