require('coffee-script');
var express = require('express'),
		path = require('path'),
		normalize = require('normalize'),
		Session = require('connect-mongodb'),
		Backbone = require("backbone"),
		_ = require("underscore"),
		$ = require("cheerio"),
		fs = require('fs'),
		Chaplin = require('./src/chaplin'),
		config = require('./config'),
		utils = require('./lib/utils'),
		app = express(),
		baseDir = config.baseDir = path.normalize(__dirname),
		views = baseDir + "/views",
		webroot = baseDir + "/public",
		api,
		host,
		port,
		stylus,
		webroot,
		_ref,
		routes = require('./shared/routes'),
		Application = require('./shared/application'),
		client_app,
		LayoutManager;


LayoutManager = Chaplin.MgrView;

// Configure LayoutManager with some very useful defaults for Node.js
// environments.  This allows the end user to simply consume instead of
// fighting with the desirable configuration.
LayoutManager.configure({
	prefix: "shared/templates/",
	// Sensible default for Node.js is to load templates from the filesystem.
	// This is similar to how we default to script tags in browser-land.
	fetchTemplate: function (template) {
		// Automatically add the `.html` extension.
		template = template + ".html";

		// Put this fetch into `async` mode to work better in the Node environment.
		var done = this.async();

		// By default read in the file from the filesystem relative to the code
		// being executed.
		fs.readFile(template, function (err, contents) {
			// Ensure the contents are a String.
			contents = String(contents);

			// Any errors should be reported.
			if (err) {
				console.error("Unable to load file " + template + " : " + err);

				return done(null);
			}

			// Pass the template contents back up.
			done(_.template(contents));
		});
	}
});


app.enable('trust proxy');

app.set('views', views);

app.set('view engine', 'ejs');

app.set('view options', {
	layout: false
});

app.use(express.favicon());

app.use(express.logger('dev'));

app.use(express["static"](webroot));

app.use('/upload', express["static"](baseDir + "/upload"));

app.use(express.bodyParser({
	uploadDir: baseDir + '/tmp'
}));

app.use(express.cookieParser());

/*app.use(express.session({
 key: 'session_id',
 store: new Session({
 url: config.db,
 maxAge: 300000
 }),
 secret: config.httpd.session_key || "balabala"
 }));*/

app.use(function (req, resp, next) {
	resp.header('Access-Control-Allow-Origin', config.allowedDomains || '*');
	resp.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
	resp.header('Access-Control-Allow-Headers', 'Content-Type');
	resp.header('Cache-Control', 'no-cache');
	return next();
});

//auth(app);

/**
 * handle the backbone routers
 */

app.use(function (req, resp, next) {
	var location = new utils.Location(req, resp),
			setSubVwKeepFn;

	setSubVwKeepFn = function(vw) {
		var subVws = vw.getViews();
		subVws.each(function (view) {
			/**
			 * set the view's state to keep
			 */
			view.keep = true;
		});
	};

	client_app = new Application({
		location: location,
		// events: events,
		routes: routes,
		controllerSuffix: '-controller',
		onViewRendered: function (controller, params, route, options) {
			var vw = controller.view,
					manager = vw.__manager__,
					currentVw = vw,
					html;

			setSubVwKeepFn(currentVw);

			while (manager.parent && manager.parent.__manager__) {
				currentVw = manager.parent;
				manager = currentVw && currentVw.__manager__;
				if(currentVw) {
					setSubVwKeepFn(currentVw);
				}
			}

			currentVw.render().promise().then(function () {
				html = $.html(currentVw.$el);
				resp.render('layout', { body: html })
			});
		}
	});
});


//router(app);

//api = app.use('/api', require('./lib/api'));

host = config.httpd.bind || "127.0.0.1";

port = process.env.PORT || config.httpd.port || 3000;

console.info("Listening on port " + host + ":" + port);

app.listen(port, host);