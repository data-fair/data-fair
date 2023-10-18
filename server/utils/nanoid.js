const { customAlphabet } = require('nanoid')

// uppercase cannot be used in ES index names
module.exports = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz-', 24)
