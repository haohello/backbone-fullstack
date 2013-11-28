var url = require('url'),
    _ = require('underscore'),
    forEach,
    Location;
forEach = function(arr, fn) {
  return function(cb) {
    var step;
    if (!arr) {
      return cb(null, null);
    }
    step = function(i, err) {
      if (err) {
        return cb(err, arr);
      }
      if (i < arr.length) {
        return fn(arr[i], step.bind(null, i + 1));
      } else {
        return cb(null, arr);
      }
    };
    return step(0);
  };
};


Location = function(req, res) {
    _.extend(this, url.parse(req.url), {req: req, res: res});
};
Location.prototype.assign = Location.prototype.replace = function(path) {
    this.res.redirect(path);
};

module.exports = {
  forEach : forEach,
  Location: Location
}; 