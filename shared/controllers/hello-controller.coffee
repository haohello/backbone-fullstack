Controller = require('./base/controller')
HelloWorld = require '../models/hello-world'
HelloWorldView = require '../views/hello-world-view'

module.exports = class HelloController extends Controller
  show: (params) ->
    @model = new HelloWorld()
    @view = new HelloWorldView
      model: @model
      region: 'main'
      mediator: @mediator