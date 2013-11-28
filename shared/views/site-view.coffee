Chaplin = require '../../src/chaplin'
module.exports = class SiteView extends Chaplin.MgrView
  id: 'site-container'
  regions:
    main: '#main-container'
  template: 'site'
