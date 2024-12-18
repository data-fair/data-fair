const { customAlphabet } = require('nanoid')

// uppercase cannot be used in ES index names
export default customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz-', 24)
