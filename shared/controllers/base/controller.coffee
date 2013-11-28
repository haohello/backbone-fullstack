Chaplin = require('../../../src/chaplin')
SiteView = require('../../views/site-view')
module.exports = class Controller extends Chaplin.Controller
  # Place your application-specific controller features here
  beforeAction: ->
    @compose 'site', SiteView