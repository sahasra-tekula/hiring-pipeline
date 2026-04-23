const { randomUUID } = require("node:crypto");

function requestContext(req, res, next) {
  req.requestId = req.header("x-request-id") || randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}

module.exports = {
  requestContext,
};