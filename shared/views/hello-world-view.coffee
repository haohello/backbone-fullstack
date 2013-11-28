Chaplin = require '../../src/chaplin'

module.exports = class HelloWorldView extends Chaplin.MgrView
  className: 'hello-world'
  # Save the template string in a prototype property.
  # This is overwritten with the compiled template function.
  # In the end you might want to used precompiled templates.
  template: 'hello-world'