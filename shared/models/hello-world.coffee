Model = require './base/model'

module.exports = class HelloWorld extends Model
  defaults:
    message: 'Hello World!'
  initialize: (attributes, options) ->
    super
    console.log 'HelloWorld#initialize'
