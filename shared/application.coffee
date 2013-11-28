Chaplin = require '../src/chaplin'

# The application object.
# Choose a meaningful name for your application.
module.exports = class Application extends Chaplin.Application
  title: 'Chaplin example application'
  # start: ->
  #   # You can fetch some data here and start app
  #   # (by calling `super`) after that.
  #   super
