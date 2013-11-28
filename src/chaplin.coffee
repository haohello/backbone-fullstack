_ = require 'underscore'
Backbone = require 'backbone'
$ = require("cheerio")

# This is to avoid unwanted errors thrown when using
# `Backbone.View#setElement`.
jQueryStub = ->
  this

CheerioAdapters =
  on: jQueryStub
  off: jQueryStub
  bind: jQueryStub
  unbind: jQueryStub
  delegate: jQueryStub
  undelegate: jQueryStub
  live: jQueryStub
  die: jQueryStub
  trigger: jQueryStub

_.extend $::, CheerioAdapters

# Since jQuery is not being used and LayoutManager depends on a Promise
# implementation close to jQuery, we use `underscore.deferred` here which
# matches jQuery's Deferred API exactly.  This is mixed into Cheerio to make
# it more seamless.
_.extend $, require("underscore.deferred")

# Set the Backbone DOM library to be Cheerio.
Backbone.$ = $

# Get Backbone and _ into the global scope.
_.defaults global,
  Backbone: Backbone
  _: _


# Main entry point into Chaplin module.
# Load all components and expose them.
module.exports =
  Application:    require './chaplin/application'
  Mediator:       require './chaplin/mediator'
  Dispatcher:     require './chaplin/dispatcher'
  Controller:     require './chaplin/controllers/controller'
  Composer:       require './chaplin/composer'
  Composition:    require './chaplin/lib/composition'
  Collection:     require './chaplin/models/collection'
  Model:          require './chaplin/models/model'
  Layout:         require './chaplin/views/layout'
  View:           require './chaplin/views/view'
  MgrView:        require './chaplin/views/view'
  CollectionView: require './chaplin/views/collection_view'
  Route:          require './chaplin/lib/route'
  Router:         require './chaplin/lib/router'
  Delayer:        require './chaplin/lib/delayer'
  EventBroker:    require './chaplin/lib/event_broker'
  helpers:        require './chaplin/lib/helpers'
  support:        require './chaplin/lib/support'
  SyncMachine:    require './chaplin/lib/sync_machine'
  utils:          require './chaplin/lib/utils'
