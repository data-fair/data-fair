// a small tool to switch between pump and pipeline to check if one of them is better
// at handling some occasional "premature close" errors that crash the service
import pump from 'pump'
import { promisify } from 'node:util'

export default promisify(pump)
