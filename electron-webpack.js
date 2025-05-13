const path = require('path');

module.exports = {
  renderer: {
    webpackConfig: null, // Using null to use the default config
    sourceDirectory: 'src/renderer',
    template: path.resolve(__dirname, 'src/index.html')
  },
  staticSourceDirectory: 'static'
} 