const webpack = require('webpack')
const path = require('path')

module.exports = {
  entry: './public/src/app.js',
  output: {
    filename: 'app.js',
    path: path.join(__dirname, '/public/bundles'),
    publicPath: './bundles/',
    chunkFilename: process.env.NODE_ENV !== 'development' ? '[name].[hash].app.js' : '[name].app.js'
  },
  module: {
    loaders: [{
      test: /\.vue$/,
      loader: 'vue-loader'
    }, {
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel-loader',
      query: {
        presets: ['es2015']
      }
    }, {
      test: /\.css$/,
      loader: process.env.NODE_ENV !== 'development' ? 'style-loader!css-loader?minimize' : 'style-loader!css-loader?-minimize'
    }, {
      test: [/assets\/.*$/, /\.png$/, /\.svg$/],
      loader: 'file-loader'
    }]
  },
  resolve: {
    alias: {
      'vue$': 'vue/dist/vue.common.js'
    }
  },
  devtool: process.env.NODE_ENV !== 'development' ? 'source-map' : 'eval',
  plugins: process.env.NODE_ENV !== 'development' ? [
    new webpack.optimize.UglifyJsPlugin()
  ] : []
}
