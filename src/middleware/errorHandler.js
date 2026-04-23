const { isAppError } = require("../lib/errors");

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.originalUrl}.`,
    },
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details || null,
        requestId: req.requestId || null,
      },
    });
    return;
  }

  console.error("full error", error);

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
      requestId: req.requestId || null,
    },
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};