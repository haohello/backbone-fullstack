'use strict';

var Chaplin = require('chaplin'),
		Backbone = Backbone || require('backbone'),
		_ = _ || require('underscore'),
		$ = Backbone.$,
		EventBroker = require('../lib/event_broker'),
		utils = require('../lib/utils'),
		/**
		 *  Create a reference to the global object.
		 *  In browsers, it will map to the `window` object;
		 *  in Node, it will be `global`.
		 */
				window = this,
		/**
		 * Maintain reference to the original constructor.
		 */
				ViewConstructor = Backbone.View,
		/**
		 * Cache these methods for performance.
		 */
				aPush = Array.prototype.push,
		aConcat = Array.prototype.concat,
		aSplice = Array.prototype.splice,
		trim = String.prototype.trim ?
				_.bind(String.prototype.trim.call, String.prototype.trim) :
				$.trim,
		LayoutManager;


var attach, bind, setHTML;
var __indexOf = Array.prototype.indexOf || function (item) {
	for (var i = 0, l = this.length; i < l; i++) {
		if (this[i] === item) return i;
	}
	return -1;
}, __bind = function (fn, me) {
	return function () {
		return fn.apply(me, arguments);
	};
};

bind = function () {
	if (Function.prototype.bind) {
		return function (item, ctx) {
			return item.bind(ctx);
		};
	} else if (_.bind) {
		return _.bind;
	}
};
setHTML = function () {
	if ($) {
		return function (elem, html) {
			return elem.html(html);
		};
	} else {
		return function (elem, html) {
			return elem.innerHTML = html;
		};
	}
};
attach = function () {
	if ($) {
		return function (view) {
			var actual;
			actual = $(view.container);
			if (typeof view.containerMethod === 'function') {
				return view.containerMethod(actual, view.el);
			} else {
				return actual[view.containerMethod](view.el);
			}
		};
	} else {
		return function (view) {
			var actual;
			actual = typeof view.container === 'string' ? document.querySelector(view.container) : view.container;
			if (typeof view.containerMethod === 'function') {
				return view.containerMethod(actual, view.el);
			} else {
				return actual[view.containerMethod](view.el);
			}
		};
	}
};
/**
 * @class LayoutManager is a wrapper around a `Backbone.View`.
 * @extends Backbone.View
 *  Backbone.View.extend takes options (protoProps, staticProps)
 */
LayoutManager = Backbone.View.extend({
			/**
			 * Automatic rendering
			 * -------------------
			 * Flag whether to render the view automatically on initialization.
			 * As an alternative you might pass a `render` option to the constructor.
			 */
			autoRender: false,

			/**
			 * Flag whether to attach the view automatically on render.
			 */
			autoAttach: true,
			/**
			 * Automatic inserting into DOM
			 * -------------------
			 * View container element.
			 * Set this property in a derived class to specify the container element.
			 * Normally this is a selector string but it might also be an element or
			 * jQuery object.
			 * The view is automatically inserted into the container when it’s rendered.
			 * As an alternative you might pass a `container` option to the constructor.
			 *
			 */
			container: null,

			/**
			 * Method which is used for adding the view to the DOM
			 * Like jQuery’s `html`, `prepend`, `append`, `after`, `before` etc.
			 */
			containerMethod: $ ? 'append' : 'appendChild',

			/**
			 * Regions
			 * -------
			 * Region registration; regions are in essence named selectors that aim
			 * to decouple the view from its parent.
			 * This functions close to the declarative events hash; use as follows:
			 *    regions:
			 *      'region1': '.class'
			 *      'region2': '#id'
			 */
			/**
			 * Region application is the reverse; you're specifying that this view
			 * will be inserted into the DOM at the named region. Error thrown if
			 * the region is unregistered at the time of initialization.
			 * Set the region name on your derived class or pass it into the
			 * constructor in controller action.
			 */
			region: null,
			/**
			 * A view is `stale` when it has been previously composed by the last
			 * route but has not yet been composed by the current route.
			 */
			stale: false,

			/**
			 * Flag whether to wrap a view with the `tagName` element when
			 * rendering into a region.
			 */
			noWrap: false,

			/**
			 * Specifies if current element should be kept in DOM after disposal.
			 */
			keepElement: false,

			/**
			 * Subviews
			 * --------
			 * List of subviews.
			 */
			subviews: null,
			subviewsByName: null,

			/**
			 * Disposal
			 * --------
			 */
			disposed: false,

			/**
			 * Initialization
			 * --------------
			 * List of options that will be picked from constructor.
			 * Easy to extend: `optionNames: View::optionNames.concat ['template']`
			 */
			optionNames: [
				'autoAttach', 'autoRender',
				'container', 'containerMethod',
				'region', 'regions',
				'noWrap'
			],
			_render: function () {
				/**
				 * Keep the view consistent between callbacks and deferreds.
				 */
				var view = this,
						/**
						 * Shorthand the manager.
						 */
								manager = view.__manager__,
						/**
						 * Cache these properties.
						 */
								beforeRender = view.beforeRender,
						/**
						 * Create a deferred instead of going off
						 */
								def = view.deferred();
				/**
				 * Ensure all nested Views are properly scrubbed if re-rendering.
				 */
				if (view.hasRendered) {
					view._removeViews();
				}

				/**
				 * This continues the render flow after `beforeRender` has completed.
				 */
				manager.callback = function () {
					/**
					 * Clean up asynchronous manager properties.
					 */
					delete manager.isAsync;
					delete manager.callback;

					/**
					 * Always emit a beforeRender event.
					 */
					view.trigger("beforeRender", view);

					/**
					 * Render!
					 */
					view._viewRender(manager).render().then(function () {
						/**
						 * Complete this deferred once resolved.
						 */
						def.resolve();
					});
				};

				/**
				 * If a beforeRender function is defined, call it.
				 */
				if (beforeRender) {
					beforeRender.call(view, view);
				}

				if (!manager.isAsync) {
					manager.callback();
				}

				/**
				 * Return this intermediary promise.
				 */
				return def.promise();
			},

			/**
			 * This function is responsible for pairing the
			 * rendered template into the DOM element.
			 * @param {Object} rendered
			 * @param {Object} manager
			 * @param {Object} def
			 */
			_applyTemplate: function (rendered, manager, def) {
				/**
				 * Actually put the rendered contents into the element.
				 */
				if (_.isString(rendered)) {
					/**
					 * If no container is specified, we must replace the content.
					 */
					if (manager.noel) {
						rendered = $.parseHTML(rendered, true);

						/**
						 * Remove extra root elements.
						 */
						this.$el.slice(1).remove();

						/**
						 * Swap out the View on the first top level element
						 *  to avoid duplication.
						 */
						this.$el.replaceWith(rendered);

						/**
						 * Don't delegate events here - we'll do that in resolve()
						 */
						this.setElement(rendered, false);
					} else {
						this.html(this.$el, rendered);
					}
				}

				/**
				 * Resolve only after fetch and render have succeeded.
				 */
				def.resolveWith(this, [this]);
			},

			/**
			 * Creates a deferred and returns a function to call when finished.
			 * This gets passed to all _render methods.  The `root` value here is passed
			 * from the `manage(this).render()` line in the `_render` function
			 * @param {Object} manager
			 */
			_viewRender: function (manager) {
				var root = this,
						url,
						contents,
						def;

				/**
				 * Once the template is successfully fetched, use its contents to proceed.
				 * Context argument is first, since it is bound for partial application
				 * reasons.
				 * @param {Object} context
				 * @param {Object} template
				 */
				function done(context, template) {
					/**
					 * Store the rendered template someplace so it can be re-assignable.
					 */
					var rendered;

					/**
					 * Trigger this once the render method has completed.
					 * @param {Object} rendered
					 */
					manager.callback = function (rendered) {
						/**
						 * Clean up asynchronous manager properties.
						 */
						delete manager.isAsync;
						delete manager.callback;

						root._applyTemplate(rendered, manager, def);
					};

					/**
					 * Ensure the cache is up-to-date.
					 */
					LayoutManager.cache(url, template);

					/**
					 * Render the View into the el property.
					 */
					if (template) {
						rendered = root.renderTemplate.call(root, template, context);
					}

					/**
					 * If the function was synchronous, continue execution.
					 */
					if (!manager.isAsync) {
						root._applyTemplate(rendered, manager, def);
					}
				}

				return {
					/**
					 * This `render` function is what gets called inside of the View render,
					 * when `manage(this).render` is called.  Returns a promise that can be
					 * used to know when the element has been rendered into its parent.
					 */
					render: function () {
						var context = root.serialize,
								template = root.template;

						/**
						 * Create a deferred specifically for fetching.
						 */
						def = root.deferred();

						/**
						 * If data is a function, immediately call it.
						 */
						if (_.isFunction(context)) {
							context = context.call(root);
						}

						/**
						 * Set the internal callback to trigger once the asynchronous or
						 * synchronous behavior has completed.
						 * @param {Object} contents
						 */
						manager.callback = function (contents) {
							/**
							 * Clean up asynchronous manager properties.
							 */
							delete manager.isAsync;
							delete manager.callback;

							done(context, contents);
						};

						/**
						 * Set the url to the prefix + the view's template property.
						 */
						if (typeof template === "string") {
							url = root.prefix + template;
						}

						/**
						 * Check if contents are already cached and if they are, simply process
						 * the template with the correct data.
						 */
						if (contents = LayoutManager.cache(url)) {
							done(context, contents, url);

							return def;
						}

						/**
						 * Fetch layout and template contents.
						 */
						if (typeof template === "string") {
							contents = root.fetchTemplate.call(root, root.prefix +
									template);
							/**
							 * If the template is already a function, simply call it.
							 */
						} else if (typeof template === "function") {
							contents = template;
							/**
							 * If its not a string and not undefined, pass the value to `fetch`.
							 */
						} else if (template != null) {
							contents = root.fetchTemplate.call(root, template);
						}

						/**
						 * If the function was synchronous, continue execution.
						 */
						if (!manager.isAsync) {
							done(context, contents);
						}

						return def;
					}
				};
			},

			/**
			 * @constructor This named function allows for significantly easier debugging.
			 * @param {Object} options
			 */
			constructor: function Layout(options) {
				var k;
				/**
				 * Grant this View superpowers.
				 */
				this.manage = true;

				/**
				 * Copy some options to instance properties.
				 */
				var optName, optValue, render;
				if (options) {
					for (optName in options) {
						optValue = options[optName];
						if (__indexOf.call(this.optionNames, optName) >= 0) {
							this[optName] = optValue;
						}
					}
				}
				render = this.render;
				this.render = __bind(function () {
					if (this.disposed) {
						return false;
					}
					render.apply(this, arguments);
					/*if (this.autoAttach) {
					 this.attach.apply(this, arguments);
					 }*/
					return this;
				}, this);

				/**
				 * Initialize subviews collections.
				 */

				this.subviews = [];
				this.subviewsByName = {};

				/**
				 * Give this View access to all passed options as instance properties.
				 */
				_.extend(this, options);

				/**
				 * Have Chaplin set up the rest of this View.
				 */
				Backbone.View.apply(this, arguments);
				/**
				 * Replacing the view in the region with a new View.
				 */
				var region;
				if (this.region) {
					region = this.mediator.execute('region:find', this.region);
					if (region != null) {
						region.instance.insertView(region.name, this);
					}
				}

				/**
				 * Set up declarative bindings after `initialize` has been called
				 * so initialize may set model/collection and create or bind methods.
				 */
				this.delegateListeners();

				/**
				 * Listen for disposal of the model or collection.
				 * If the model is disposed, automatically dispose the associated view.
				 */
				if (this.model) {
					this.listenTo(this.model, 'dispose', this.dispose);
				}
				if (this.collection) {
					this.listenTo(this.collection, 'dispose', __bind(function (subject) {
						if (!subject || subject === this.collection) {
							return this.dispose();
						}
					}, this));
				}
				if (this.regions != null) {
					this.mediator.execute('region:register', this);
				}
				if (this.autoRender) {
					this.render();
				}
			},

			/**
			 * User input event handling
			 * -------------------------

			 * Event handling using event delegation
			 * Register a handler for a specific event type
			 * For the whole view:
			 *   delegate(eventName, handler)
			 *   e.g.
			 *   @delegate('click', @clicked)
			 * For an element in the passing a selector:
			 *   delegate(eventName, selector, handler)
			 *   e.g.
			 *   @delegate('click', 'button.confirm', @confirm)
			 * @returns {Function|callback|callback|callback|callback}
			 */
			delegate: function (eventName, second, third) {
				var bound, event, events, handler, list, selector;
				if (Backbone.View.prototype.delegate) {
					return LayoutManager.__super__.delegate.apply(this, arguments);
				}
				if (typeof eventName !== 'string') {
					throw new TypeError('View#delegate: first argument must be a string');
				}
				if (arguments.length === 2) {
					handler = second;
				} else if (arguments.length === 3) {
					selector = second;
					if (typeof selector !== 'string') {
						throw new TypeError('View#delegate: ' + 'second argument must be a string');
					}
					handler = third;
				} else {
					throw new TypeError('View#delegate: ' + 'only two or three arguments are allowed');
				}
				if (typeof handler !== 'function') {
					throw new TypeError('View#delegate: ' + 'handler argument must be function');
				}
				list = (function () {
					var _i, _len, _ref, _results;
					_ref = eventName.split(' ');
					_results = [];
					for (_i = 0, _len = _ref.length; _i < _len; _i++) {
						event = _ref[_i];
						_results.push("" + event + ".delegate" + this.cid);
					}
					return _results;
				}).call(this);
				events = list.join(' ');
				bound = bind(handler, this);
				this.$el.on(events, selector || null, bound);
				return bound;
			},

			_delegateEvents: function (events) {
				var bound, eventName, handler, key, match, selector, value;
				if (Backbone.View.prototype.delegateEvents.length === 2) {
					return Backbone.View.prototype.delegateEvents.call(this, events, true);
				}
				for (key in events) {
					value = events[key];
					handler = typeof value === 'function' ? value : this[value];
					if (!handler) {
						throw new Error("Method '" + handler + "' does not exist");
					}
					match = key.match(/^(\S+)\s*(.*)$/);
					eventName = "" + match[1] + ".delegateEvents" + this.cid;
					selector = match[2];
					bound = bind(handler, this);
					this.$el.on(eventName, selector || null, bound);
				}
			},

			delegateEvents: function (events, keepOld) {
				var classEvents, _i, _len, _ref;
				if (!keepOld) {
					this.undelegateEvents();
				}
				if (events) {
					return this._delegateEvents(events);
				}
				_ref = utils.getAllPropertyVersions(this, 'events');
				for (_i = 0, _len = _ref.length; _i < _len; _i++) {
					classEvents = _ref[_i];
					if (typeof classEvents === 'function') {
						throw new TypeError('View#delegateEvents: functions are not supported');
					}
					this._delegateEvents(classEvents);
				}
			},

			undelegate: function (eventName, second, third) {
				var event, events, handler, list, selector;
				if (Backbone.View.prototype.undelegate) {
					return LayoutManager.__super__.undelegate.apply(this, arguments);
				}
				if (eventName) {
					if (typeof eventName !== 'string') {
						throw new TypeError('View#undelegate: first argument must be a string');
					}
					if (arguments.length === 2) {
						if (typeof second === 'string') {
							selector = second;
						} else {
							handler = second;
						}
					} else if (arguments.length === 3) {
						selector = second;
						if (typeof selector !== 'string') {
							throw new TypeError('View#undelegate: ' + 'second argument must be a string');
						}
						handler = third;
					}
					list = (function () {
						var _i, _len, _ref, _results;
						_ref = eventName.split(' ');
						_results = [];
						for (_i = 0, _len = _ref.length; _i < _len; _i++) {
							event = _ref[_i];
							_results.push("" + event + ".delegate" + this.cid);
						}
						return _results;
					}).call(this);
					events = list.join(' ');
					return this.$el.off(events, selector || null);
				} else {
					return this.$el.off(".delegate" + this.cid);
				}
			},

			delegateListeners: function () {
				var eventName, key, method, target, version, _i, _len, _ref, _ref1;
				if (!this.listen) {
					return;
				}
				_ref = utils.getAllPropertyVersions(this, 'listen');
				for (_i = 0, _len = _ref.length; _i < _len; _i++) {
					version = _ref[_i];
					for (key in version) {
						method = version[key];
						if (typeof method !== 'function') {
							method = this[method];
						}
						if (typeof method !== 'function') {
							throw new Error('View#delegateListeners: ' + ("" + method + " must be function"));
						}
						_ref1 = key.split(' '), eventName = _ref1[0], target = _ref1[1];
						this.delegateListener(eventName, target, method);
					}
				}
			},

			delegateListener: function (eventName, target, callback) {
				var prop;
				if (target === 'model' || target === 'collection') {
					prop = this[target];
					if (prop) {
						this.listenTo(prop, eventName, callback);
					}
				} else if (target === 'mediator') {
					this.subscribeEvent(eventName, callback);
				} else if (!target) {
					this.on(eventName, callback, this);
				}
			},

			registerRegion: function (name, selector) {
				return this.mediator.execute('region:register', this, name, selector);
			},

			unregisterRegion: function (name) {
				return this.mediator.execute('region:unregister', this, name);
			},

			unregisterAllRegions: function () {
				return this.mediator.execute({
					name: 'region:unregister',
					silent: true
				}, this);
			},

			subview: function (name, view) {
				var byName, subviews;
				subviews = this.subviews;
				byName = this.subviewsByName;
				if (name && view) {
					this.removeSubview(name);
					subviews.push(view);
					byName[name] = view;
					return view;
				} else if (name) {
					return byName[name];
				}
			},

			removeSubview: function (nameOrView) {
				var byName, index, name, otherName, otherView, subviews, view;
				if (!nameOrView) {
					return;
				}
				subviews = this.subviews;
				byName = this.subviewsByName;
				if (typeof nameOrView === 'string') {
					name = nameOrView;
					view = byName[name];
				} else {
					view = nameOrView;
					for (otherName in byName) {
						otherView = byName[otherName];
						if (!(otherView === view)) {
							continue;
						}
						name = otherName;
						break;
					}
				}
				if (!(name && view && view.dispose)) {
					return;
				}
				view.dispose();
				index = utils.indexOf(subviews, view);
				if (index !== -1) {
					subviews.splice(index, 1);
				}
				return delete byName[name];
			},

			attach: function () {
				if (this.region != null) {
					this.mediator.execute('region:show', this.region, this);
				}
				if (this.container && !document.body.contains(this.el)) {
					attach(this);
					return this.trigger('addedToDOM');
				}
			},

			/**
			 * This method is used within specific methods to indicate that they should
			 * be treated as asynchronous.  This method should only be used within the
			 * render chain, otherwise unexpected behavior may occur.
			 */
			async: function () {
				var manager = this.__manager__;

				/**
				 * Set this View's action to be asynchronous.
				 */
				manager.isAsync = true;

				/**
				 * Return the callback.
				 */
				return manager.callback;
			},

			promise: function () {
				return this.__manager__.renderDeferred.promise();
			},

			/**
			 * Sometimes it's desirable to only render the child views under the parent.
			 * This is typical for a layout that does not change.  This method will
			 * iterate over the child Views and aggregate all child render promises and
			 * return the parent View.  The internal `promise()` method will return the
			 * aggregate promise that resolves once all children have completed their
			 * render.
			 * @return {Object} the current view object
			 */
			renderViews: function () {
				var root = this,
						manager = root.__manager__,
						newDeferred = root.deferred(),
						promises;

				/**
				 * Collect all promises from rendering the child views and wait till they
				 * all complete.
				 */
				promises = root.getViews().map(function (view) {
					return view.render().__manager__.renderDeferred;
				}).value();

				/**
				 * Simulate a parent render to remain consistent.
				 */
				manager.renderDeferred = newDeferred.promise();

				/**
				 * Once all child views have completed rendering, resolve parent deferred
				 * with the correct context.
				 */
				root.when(promises).then(function () {
					newDeferred.resolveWith(root, [root]);
				});

				/**
				 * Allow this method to be chained.
				 */
				return root;
			},

			/**
			 * Shorthand to `setView` function with the `insert` flag set.
			 * @param {Object} selector
			 * @param {Object} view
			 */
			insertView: function (selector, view) {
				/**
				 * If the `view` argument exists, then a selector was passed in.  This code
				 * path will forward the selector on to `setView`.
				 */
				if (view) {
					return this.setView(selector, view, true);
				}

				/**
				 * If no `view` argument is defined, then assume the first argument is the
				 * View, somewhat now confusingly named `selector`.
				 */
				return this.setView(selector, true);
			},

			/**
			 * Iterate over an object and ensure every value is wrapped in an array to
			 * ensure they will be inserted, then pass that object to `setViews`.
			 * @param {Object} views
			 */
			insertViews: function (views) {
				/**
				 * If an array of views was passed it should be inserted into the
				 * root view. Much like calling insertView without a selector.
				 */
				if (_.isArray(views)) {
					return this.setViews({ "": views });
				}

				_.each(views, function (view, selector) {
					views[selector] = _.isArray(view) ? view : [view];
				});

				return this.setViews(views);
			},

			/**
			 * Returns the View that matches the `getViews` filter function.
			 * @param {Object} fn
			 */
			getView: function (fn) {
				/**
				 * If `getView` is invoked with undefined as the first argument, then the
				 * second argument will be used instead.  This is to allow
				 * `getViews(undefined, fn)` to work as `getViews(fn)`.  Useful for when
				 * you are allowing an optional selector.
				 */
				if (fn == null) {
					fn = arguments[1];
				}

				return this.getViews(fn).first().value();
			},

			/**
			 * Provide a filter function to get a flattened array of all the subviews.
			 * If the filter function is omitted it will return all subviews.  If a
			 * String is passed instead, it will return the Views for that selector.
			 * @param {Object} fn
			 */
			getViews: function (fn) {
				var views;

				/**
				 * If the filter argument is a String, then return a chained Version of the
				 * elements. The value at the specified filter may be undefined, a single
				 * view, or an array of views; in all cases, chain on a flat array.
				 */
				if (typeof fn === "string") {
					fn = this.regions[fn] || fn;
					views = this.views[fn] || [];

					/**
					 * If Views is undefined you are concatenating an `undefined` to an array
					 * resulting in a value being returned.  Defaulting to an array prevents
					 * this. return _.chain([].concat(views || []));
					 */
					return _.chain([].concat(views));
				}

				/**
				 * Generate an array of all top level (no deeply nested) Views flattened.
				 */
				views = _.chain(this.views).map(function (view) {
					return _.isArray(view) ? view : [view];
				}, this).flatten();

				/**
				 * If the argument passed is an Object, then pass it to `_.where`.
				 */
				if (typeof fn === "object") {
					return views.where(fn);
				}

				/**
				 * If a filter function is provided, run it on all Views and return a
				 * wrapped chain. Otherwise, simply return a wrapped chain of all Views.
				 */
				return typeof fn === "function" ? views.filter(fn) : views;
			},

			/**
			 * Use this to remove Views, internally uses `getViews` so you can pass the
			 * same argument here as you would to that method.
			 * @param {Function} fn
			 */
			removeView: function (fn) {
				/**
				 * Allow an optional selector or function to find the right model and
				 * remove nested Views based off the results of the selector or filter.
				 */
				return this.getViews(fn).each(function (nestedView) {
					nestedView.remove();
				});
			},

			/**
			 * This takes in a partial name and view instance and assigns them to
			 * the internal collection of views.  If a view is not a LayoutManager
			 * instance, then mix in the LayoutManager prototype.  This ensures
			 * all Views can be used successfully.
			 *
			 * Must definitely wrap any render method passed in or defaults to a
			 * typical render function `return layout(this).render()`.
			 * @param {String} name
			 * @param {Object} view
			 * @param {Boolean} insert
			 * @return {Object} the view object that has been set up
			 */
			setView: function (name, view, insert) {
				/**
				 * Parent view, the one you are setting a View on.
				 */
				var root = this,
						manager,
						selector;

				/**
				 * If no name was passed, use an empty string and shift all arguments.
				 */
				if (typeof name !== "string") {
					insert = view;
					view = name;
					name = "";
				}

				/**
				 * Shorthand the `__manager__` property.
				 */
				manager = view.__manager__;

				/**
				 * If the View has not been properly set up, throw an Error message
				 * indicating that the View needs `manage: true` set.
				 */
				if (!manager) {
					throw new Error("The argument associated with selector '" + name +
							"' is defined and a View.  Set `manage` property to true for " +
							"Backbone.View instances.");
				}

				/**
				 * Add reference to the parentView.
				 */
				manager.parent = root;

				/**
				 * Add reference to the placement selector used.
				 */
				selector = manager.selector = root.regions[name] || name;

				/**
				 * Code path is less complex for Views that are not being inserted.
				 * Simply remove existing Views and bail out with the assignment.
				 */
				if (!insert) {
					/**
					 * If the View we are adding has already been rendered, simply inject it
					 * into the parent.
					 */
					if (view.hasRendered) {
						/**
						 * Apply the partial.
						 */
						view.partial(root.$el, view.$el, root.__manager__, manager);
					}

					/**
					 * Ensure remove is called when swapping View's.
					 */
					root.removeView(name);

					/**
					 * Assign to main views object and return for chainability.
					 */
					return root.views[selector] = view;
				}

				/**
				 * Ensure this.views[selector] is an array and push this View to the end.
				 */
				root.views[selector] = aConcat.call([], root.views[name] || [], view);

				/**
				 * Put the parent view into `insert` mode.
				 */
				root.__manager__.insert = true;

				return view;
			},

			/**
			 * Allows the setting of multiple views instead of a single view.
			 * @param {Object} views
			 */
			setViews: function (views) {
				/**
				 * Iterate over all the views and use the View's view method to assign.
				 */
				_.each(views, function (view, name) {
					/**
					 * If the view is an array put all views into insert mode.
					 */
					if (_.isArray(view)) {
						return _.each(view, function (view) {
							this.insertView(name, view);
						}, this);
					}

					/**
					 * Assign each view using the view function.
					 */
					this.setView(name, view);
				}, this);

				/**
				 * Allow for chaining
				 */
				return this;
			},

			/**
			 * By default this should find all nested views and render them into
			 * the this.el and call done once all of them have successfully been
			 * resolved.
			 *
			 * This function returns a promise that can be chained to determine
			 * once all subviews and main view have been rendered into the view.el.
			 */
			render: function () {
				var root = this,
						manager = root.__manager__,
						parent = manager.parent,
						rentManager = parent && parent.__manager__,
						def = root.deferred();

				/**
				 * Triggered once the render has succeeded.
				 */
				function resolve() {
					var next;

					/**
					 * Insert all subViews into the parent at once.
					 */
					_.each(root.views, function (views, selector) {
						/**
						 * Fragments aren't used on arrays of subviews.
						 */
						if (_.isArray(views)) {
							root.htmlBatch(root, views, selector);
						}
					});

					/**
					 * If there is a parent and we weren't attached to it via the previous
					 * method (single view), attach.
					 */
					if (parent && !manager.insertedViaFragment) {
						if (!root.contains(parent.el, root.el)) {
							/**
							 * Apply the partial using parent's html() method.
							 */
							parent.partial(parent.$el, root.$el, rentManager,
									manager);
						}
					}

					/**
					 * Ensure events are always correctly bound after rendering.
					 */
					root.delegateEvents();

					/**
					 * Set this View as successfully rendered.
					 */
					root.hasRendered = true;

					/**
					 * Only process the queue if it exists.
					 */
					if (next = manager.queue.shift()) {
						/**
						 * Ensure that the next render is only called after all other
						 * `done` handlers have completed.  This will prevent `render`
						 * callbacks from firing out of order.
						 */
						next();
					} else {
						/**
						 * Once the queue is depleted, remove it, the render process has
						 * completed.
						 */
						delete manager.queue;
					}

					/**
					 * Reusable function for triggering the afterRender callback and event
					 * and setting the hasRendered flag.
					 */
					function completeRender() {
						var console = window.console;
						var afterRender = root.afterRender;

						if (afterRender) {
							afterRender.call(root, root);
						}

						/**
						 * Always emit an afterRender event.
						 */
						root.trigger("afterRender", root);

						/**
						 * If there are multiple top level elements and `el: false` is used,
						 * display a warning message and a stack trace.
						 */
						if (manager.noel && root.$el.length > 1) {
							/**
							 * Do not display a warning while testing or if warning suppression
							 * is enabled.
							 */
							if (_.isFunction(console.warn) && !root.suppressWarnings) {
								console.warn("`el: false` with multiple top level elements is " +
										"not supported.");

								/**
								 * Provide a stack trace if available to aid with debugging.
								 */
								if (_.isFunction(console.trace)) {
									console.trace();
								}
							}
						}
					}

					/**
					 * If the parent is currently rendering, wait until it has completed
					 * until calling the nested View's `afterRender`.
					 */
					if (rentManager && rentManager.queue) {
						/**
						 * Wait until the parent View has finished rendering, which could be
						 * asynchronous, and trigger afterRender on this View once it has
						 * compeleted.
						 */
						parent.once("afterRender", completeRender);
					} else {
						/**
						 * This View and its parent have both rendered.
						 */
						completeRender();
					}

					return def.resolveWith(root, [root]);
				}

				/**
				 * Actually facilitate a render.
				 */
				function actuallyRender() {

					/**
					 * The `_viewRender` method is broken out to abstract away from having
					 * too much code in `actuallyRender`.
					 */
					root._render().done(function () {
						var promises;
						/**
						 * If there are no children to worry about, complete the render
						 * instantly.
						 */
						if (!_.keys(root.views).length) {
							return resolve();
						}

						/**
						 * Create a list of promises to wait on until rendering is done.
						 * Since this method will run on all children as well, its sufficient
						 * for a full hierarchical.
						 */
						promises = _.map(root.views, function (view) {
							var insert = _.isArray(view);

							/**
							 * If items are being inserted, they will be in a non-zero length
							 * Array.
							 */
							if (insert && view.length) {
								/**
								 * Mark each subview's manager so they don't attempt to attach by
								 * themselves.  Return a single promise representing the entire
								 * render.
								 */
								return root.when(_.map(view, function (subView) {
									subView.__manager__.insertedViaFragment = true;
									return subView.render().__manager__.renderDeferred;
								}));
							}

							/**
							 * Only return the fetch deferred, resolve the main deferred after
							 * the element has been attached to it's parent.
							 */
							return !insert ? view.render().__manager__.renderDeferred : view;
						});

						/**
						 * Once all nested Views have been rendered, resolve this View's
						 * deferred.
						 */
						root.when(promises).done(resolve);
					});
				}

				/**
				 * Another render is currently happening if there is an existing queue, so
				 * push a closure to render later into the queue.
				 */
				if (manager.queue) {
					aPush.call(manager.queue, actuallyRender);
				} else {
					manager.queue = [];

					/**
					 * This the first `render`, preceeding the `queue` so render
					 * immediately.
					 */
					actuallyRender(root, def);
				}

				/**
				 * Put the deferred inside of the `__manager__` object, since we don't want
				 * end users accessing this directly anymore in favor of the `afterRender`
				 * event.  So instead of doing `render().then(...` do
				 *   `render().once("afterRender", ...`.
				 */
				root.__manager__.renderDeferred = def;

				/**
				 * Return the actual View for chainability purposes.
				 */
				return root;
			},

			/**
			 * Ensure the cleanup function is called whenever remove is called.
			 */
			remove: function () {
				/**
				 * Force remove itself from its parent.
				 */
				LayoutManager._removeView(this, true);

				/**
				 * Call the original remove function.
				 */
				return this._remove.apply(this, arguments);
			},
			dispose: function () {
				var prop, properties, subview, _i, _j, _len, _len2, subviews;

				if (this.disposed) {
					return;
				}

				/**
				 * Check if view should be removed from DOM.
				 */
				if (this.keepElement) {
					/**
					 * Clean out the events.
					 */
					LayoutManager.cleanViews(view);
				} else {
					this.remove();
				}


				//_ref = this.subviews;
				subviews = this.getViews().value();
				for (_i = 0, _len = subviews.length; _i < _len; _i++) {
					subview = subviews[_i];
					subview.dispose();
				}
				properties =
						[
							'el',
							'$el',
							'options',
							'model',
							'collection',
							'subviews',
							'subviewsByName',
							'_callbacks',
							'views',
							'regions',
							'__manager__',
							'prefix'
						];
				for (_j = 0, _len2 = properties.length; _j < _len2; _j++) {
					prop = properties[_j];
					delete this[prop];
				}
				this.disposed = true;
				if (typeof Object.freeze === "function") {
					Object.freeze(this);
				}
			}
		},

		/**
		 * Static Properties
		 */
		{
			/**
			 * Clearable cache.
			 */
			_cache: {},

			/**
			 * Remove all nested Views.
			 * @param {Object} root, view object
			 * @param {Boolean} force
			 */
			_removeViews: function (root, force) {
				/**
				 * Shift arguments around.
				 */
				if (typeof root === "boolean") {
					force = root;
					root = this;
				}

				/**
				 * Allow removeView to be called on instances.
				 */
				root = root || this;

				/**
				 * Iterate over all of the nested View's and remove.
				 */
				root.getViews().each(function (view) {
					/**
					 * Force doesn't care about if a View has rendered or not.
					 */
					if (view.hasRendered || force) {
						LayoutManager._removeView(view, force);
					}
				});
			},

			/**
			 * Remove a single nested View.
			 * @param {Object} view
			 * @param {Boolean} force
			 */
			_removeView: function (view, force) {
				var parentViews,
						/**
						 * Shorthand the managers for easier access.
						 */
								manager = view.__manager__,
						rentManager = manager.parent && manager.parent.__manager__,
						/**
						 * Test for keep.
						 */
								keep = typeof view.keep === "boolean" ? view.keep : view.options.keep;


				/**
				 * In insert mode, remove views that do not have `keep` attribute set,
				 * unless the force flag is set.
				 */
				if ((!keep && rentManager && rentManager.insert === true) || force) {
					/**
					 * Clean out the events.
					 */
					LayoutManager.cleanViews(view);

					/**
					 * Since we are removing this view, force subviews to remove
					 */
					view._removeViews(true);

					/**
					 * Remove the View completely.
					 */
					view.$el.remove();

					/**
					 * Bail out early if no parent exists.
					 */
					if (!manager.parent) {
						return;
					}

					/**
					 * Assign (if they exist) the sibling Views to a property.
					 */
					parentViews = manager.parent.views[manager.selector];

					/**
					 * If this is an array of items remove items that are not marked to keep.
					 */
					if (_.isArray(parentViews)) {
						/**
						 * Remove duplicate Views.
						 */
						return _.each(_.clone(parentViews), function (view, i) {
							/**
							 * If the managers match, splice off this View.
							 */
							if (view && view.__manager__ === manager) {
								aSplice.call(parentViews, i, 1);
							}
						});
					}

					/**
					 * Otherwise delete the parent selector.
					 */
					delete manager.parent.views[manager.selector];
				}
			},

			/**
			 * Cache templates into LayoutManager._cache.
			 * @param {Object} path
			 * @param {Object} contents
			 */
			cache: function (path, contents) {
				/**
				 * If template path is found in the cache, return the contents.
				 */
				if (path in this._cache && contents == null) {
					return this._cache[path];
					/**
					 * Ensure path and contents aren't undefined.
					 */
				} else if (path != null && contents != null) {
					return this._cache[path] = contents;
				}

				/**
				 * If the template is not in the cache, return undefined.
				 */
			},

			/**
			 * Accept either a single view or an array of views to clean of all DOM
			 * events internal model and collection references and all Backbone.Events.
			 * @param {Object} views
			 */
			cleanViews: function (views) {
				/**
				 * Clear out all existing views.
				 */
				_.each(aConcat.call([], views), function (view) {

					/**
					 * Remove all custom events attached to this View.
					 */
					view.unbind();

					/**
					 * Automatically unbind `model`.
					 */
					if (view.model instanceof Backbone.Model) {
						view.model.off(null, null, view);
					}

					/**
					 * Automatically unbind `collection`.
					 */
					if (view.collection instanceof Backbone.Collection) {
						view.collection.off(null, null, view);
					}

					/**
					 * Automatically unbind events bound to this View.
					 */
					view.unregisterAllRegions();
					view.unsubscribeAllEvents();
					// view.off(); same as view.unbind()
					view.undelegateEvents();
					view.undelegate();
					view.stopListening();

					/**
					 * If a custom cleanup method was provided on the view, call it after
					 * the initial cleanup is done
					 */
					if (_.isFunction(view.cleanup)) {
						view.cleanup();
					}
				});
			},

			/**
			 * This static method allows for global configuration of LayoutManager.
			 * @param {Object} options
			 */
			configure: function (options) {
				_.extend(LayoutManager.prototype, options);

				/**
				 * Allow LayoutManager to manage Backbone.View.prototype.
				 */
				if (options.manage) {
					Backbone.View.prototype.manage = true;
				}

				/**
				 * Disable the element globally.
				 */
				if (options.el === false) {
					Backbone.View.prototype.el = false;
				}

				/**
				 * Allow global configuration of `suppressWarnings`.
				 */
				if (options.suppressWarnings === true) {
					Backbone.View.prototype.suppressWarnings = true;
				}
			},

			/**
			 * Configure a View to work with the LayoutManager plugin.
			 * @param {Object} views
			 * @param {Object} options
			 */
			setupView: function (views, options) {
				/**
				 * Don't break the options object (passed into Backbone.View#initialize).
				 */
				options = options || {};

				/**
				 * Set up all Views passed.
				 */
				_.each(aConcat.call([], views), function (view) {
					/**
					 * If the View has already been setup, no need to do it again.
					 */
					if (view.__manager__) {
						return;
					}

					var views, declaredViews;
					var proto = LayoutManager.prototype;

					/**
					 * Ensure necessary properties are set.
					 */
					_.defaults(view, {
						/**
						 * Ensure a view always has a views object.
						 */
						views: {},

						/**
						 * Ensure a view always has a regions object.
						 */
						regions: {},

						/**
						 * Internal state object used to store whether or not a View has been
						 * taken over by layout manager and if it has been rendered into the
						 * DOM.
						 */
						__manager__: {},

						/**
						 * Add the ability to remove all Views.
						 */
						_removeViews: LayoutManager._removeViews,

						/**
						 * Add the ability to remove itself.
						 */
						_removeView: LayoutManager._removeView

						/**
						 * Mix in all LayoutManager prototype properties as well.
						 */
					}, LayoutManager.prototype);

					/**
					 * Assign passed options.
					 */
					view.options = options;

					/**
					 * Merge the View options into the View.
					 */
					_.extend(view, options);

					/**
					 * By default the original Remove function is the Backbone.View one.
					 */
					view._remove = Backbone.View.prototype.remove;

					/**
					 * Ensure the render is always set correctly.
					 */
					view.render = LayoutManager.prototype.render;

					/**
					 * If the user provided their own remove override, use that instead of
					 * the default.
					 */
					if (view.remove !== proto.remove) {
						view._remove = view.remove;
						view.remove = proto.remove;
					}

					/**
					 * Normalize views to exist on either instance or options, default to
					 * options.
					 */
					views = options.views || view.views;

					/**
					 * Set the internal views, only if selectors have been provided.
					 */
					if (_.keys(views).length) {
						/**
						 * Keep original object declared containing Views.
						 */
						declaredViews = views;

						/**
						 * Reset the property to avoid duplication or overwritting.
						 */
						view.views = {};

						/**
						 * If any declared view is wrapped in a function, invoke it.
						 */
						_.each(declaredViews, function (declaredView, key) {
							if (typeof declaredView === "function") {
								declaredViews[key] = declaredView.call(view, view);
							}
						});

						/**
						 * Set the declared Views.
						 */
						view.setViews(declaredViews);
					}
				});
			}
		});

LayoutManager.VERSION = "0.9.4";

/**
 * Expose through Backbone object.
 */
Backbone.Layout = Chaplin.Layout = LayoutManager;

/**
 * @class Override _configure to provide extra functionality that
 * is necessary in order for the render function reference
 *  to be bound during initialize.
 * @param {Object} options
 */
Backbone.View = function (options) {
	var noel;

	/**
	 * Ensure options is always an object.
	 */
	options = options || {};

	/**
	 * Remove the container element provided by Backbone.
	 */
	if ("el" in options ? options.el === false : this.el === false) {
		noel = true;
	}

	/**
	 * If manage is set, do it!
	 */
	if (options.manage || this.manage) {
		/**
		 * Set up this View.
		 */
		LayoutManager.setupView(this, options);
	}

	/**
	 * Assign the `noel` property once we're sure the View we're working with is
	 * managed by LayoutManager.
	 */
	if (this.__manager__) {
		this.__manager__.noel = noel;
		this.__manager__.suppressWarnings = options.suppressWarnings;
	}

	/**
	 * Act like nothing happened.
	 */
	ViewConstructor.apply(this, arguments);
};

/**
 * Copy over the extend method.
 */
Backbone.View.extend = ViewConstructor.extend;

/**
 * Copy over the prototype as well.
 */
Backbone.View.prototype = ViewConstructor.prototype;

/**
 * Default configuration options; designed to be overriden.
 */
var defaultOptions = {
	/**
	 * Prefix template/layout paths.
	 */
	prefix: "",

	/**
	 * Can be used to supply a different deferred implementation.
	 */
	deferred: function () {
		return $.Deferred();
	},

	/**
	 * Fetch is passed a path and is expected to return template contents as a
	 * function or string.
	 * @param {String} path
	 */
	fetchTemplate: function (path) {
		return _.template($(path).html());
	},

	/**
	 * By default, render using underscore's templating and trim output.
	 * @param {Object} template
	 * @param {Object} context
	 */
	renderTemplate: function (template, context) {
		return trim(template(context));
	},

	/**
	 * By default, pass model attributes to the templates
	 */
	serialize: function () {
		return this.model ? _.clone(this.model.attributes) : {};
	},

	/**
	 * This is the most common way you will want to partially apply a view into
	 * a layout.
	 * @param {Object} $root
	 * @param {Object} $el
	 * @param {Object} rentManager
	 * @param {Object} manager
	 */
	partial: function ($root, $el, rentManager, manager) {
		var $filtered;

		/**
		 * If selector is specified, attempt to find it.
		 */
		if (manager.selector) {
			if (rentManager.noel) {
				$filtered = $root.filter(manager.selector);
				$root = $filtered.length ? $filtered : $root.find(manager.selector);
			} else {
				$root = $root.find(manager.selector);
			}
		}

		/**
		 * Use the insert method if the parent's `insert` argument is true.
		 */
		if (rentManager.insert) {
			this.insert($root, $el);
		} else {
			this.html($root, $el);
		}
	},

	/**
	 * Override this with a custom HTML method, passed a root element and content
	 * (a jQuery collection or a string) to replace the innerHTML with.
	 * @param {Object} $root
	 * @param {Object} content
	 */
	html: function ($root, content) {
		$root.html(content);
	},

	/**
	 * Used for inserting subViews in a single batch.  This gives a small
	 * performance boost as we write to a disconnected fragment instead of to the
	 * DOM directly. Smarter browsers like Chrome will batch writes internally
	 * and layout as seldom as possible, but even in that case this provides a
	 * decent boost.  jQuery will use a DocumentFragment for the batch update,
	 * but Cheerio in Node will not.
	 * @param {Object} rootView
	 * @param {Object} subViews
	 * @param {Object} selector
	 */
	htmlBatch: function (rootView, subViews, selector) {
		/**
		 * Shorthand the parent manager object.
		 */
		var rentManager = rootView.__manager__;
		/**
		 * Create a simplified manager object that tells partial() where
		 * place the elements.
		 */
		var manager = { selector: selector };

		/**
		 * Get the elements to be inserted into the root view.
		 */
		var els = _.reduce(subViews, function (memo, sub) {
			/**
			 * Check if keep is present - do boolean check in case the user
			 * has created a `keep` function.
			 */
			var keep = typeof sub.keep === "boolean" ? sub.keep : sub.options.keep;
			/**
			 * If a subView is present, don't push it.  This can only happen if
			 * `keep: true`.  We do the keep check for speed as $.contains is not
			 * cheap.
			 */
			var exists = keep && $.contains(rootView.el, sub.el);

			/**
			 * If there is an element and it doesn't already exist in our structure
			 * attach it.
			 */
			if (sub.el && !exists) {
				memo.push(sub.el);
			}

			return memo;
		}, []);

		/**
		 * Use partial to apply the elements. Wrap els in jQ obj for cheerio.
		 */
		return this.partial(rootView.$el, $(els), rentManager, manager);
	},

	/**
	 * Very similar to HTML except this one will appendChild by default.
	 * @param {Object} $root
	 * @param {Object} $el
	 */
	insert: function ($root, $el) {
		$root.append($el);
	},

	/**
	 * Return a deferred for when all promises resolve/reject.
	 * @param {Object} promises
	 */
	when: function (promises) {
		return $.when.apply(null, promises);
	},

	/**
	 * A method to determine if a View contains another.
	 * @param {Object} parent
	 * @param {Object} child
	 */
	contains: function (parent, child) {
		return $.contains(parent, child);
	}
};

/**
 *  Mixin an EventBroker.
 */
_.extend(LayoutManager.prototype, EventBroker);

/**
 * Extend LayoutManager with default options.
 */
_.extend(LayoutManager.prototype, defaultOptions);

/**
 * Assign `LayoutManager` object for AMD loaders.
 */
module.exports = LayoutManager;