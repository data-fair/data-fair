// Semantic Open API Specification library
// This may moved to an external repo
// Holds utilisty function to manipulate an API

let api

module.exports = {
  load: (jsonApi) => {
    api = jsonApi
  },
  endPoints: () => {
    return [].concat(...Object.keys(api.paths).map(path => Object.keys(api.paths[path]).map(method => ({
      method: method,
      path: path,
      operation: api.paths[path][method]
    }))))
  }
}
