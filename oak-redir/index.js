// index.js

/**
 * Required External Modules
 */

const express = require("express");
const path = require("path");
require("dotenv").config();

/**
 * App Variables
 */

const app = express();
const port = process.env.PORT || "8000";

/**
 *  App Configuration
 */

// define views folder
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

/**
 * Routes Definitions
 */

// redirect
app.get("*", (req, res) => {
  let host = req.headers.host;
  if (host === "mike-desktop.local") {
    res.redirect("http://" + host + req.url);
  } else {
    res.redirect("https://" + host + req.url);
  }
});


/**
 * Server Activation
 */
app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});
