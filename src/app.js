require('dotenv').config();
const express = require("express");
const cors = require("cors");

const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { requestContext } = require("./middleware/requestContext");
const routes = require("./routes");

const app = express();
app.use(cors()); 
app.use(express.json({ limit: "1mb" }));
app.use(requestContext);

app.use(routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

app.listen(3000, () => {
  console.log("Server running on port 3000");
});