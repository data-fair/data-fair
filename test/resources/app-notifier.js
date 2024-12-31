import express from 'express'
import bodyParser from 'body-parser'

const app = module.exports = express()
app.use(bodyParser.json({ limit: '100kb' }))

app.post('/', (req, res, next) => {
  if (req.body.event === 'finalize-end') app.emit('webhook', req.body)
})

app.listen(5900, (err) => {
  if (err) {
    console.error('Could not run server : ', err.stack)
    throw err
  }
  console.log('Notifier Listening on http://localhost:%s', 5900)
  app.emit('listening')
})
