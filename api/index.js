const app = require('../simple-booking-server.js');

module.exports = (req, res) => {
  return app(req, res);
};