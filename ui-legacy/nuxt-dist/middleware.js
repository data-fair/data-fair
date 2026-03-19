const middleware = {}

middleware['admin-required'] = require('../public/middleware/admin-required.js')
middleware['admin-required'] = middleware['admin-required'].default || middleware['admin-required']

middleware['auth-required'] = require('../public/middleware/auth-required.js')
middleware['auth-required'] = middleware['auth-required'].default || middleware['auth-required']

export default middleware
