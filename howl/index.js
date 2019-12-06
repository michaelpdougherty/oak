// index.js

/**
 * Required External Modules
 */

const express = require("express")
const path = require("path")

const session = require("express-session")

require("dotenv").config()

/**
 * App Variables
 */

const app = express()
const port = process.env.PORT || "9000"

/**
 *  App Configuration
 */

// configure pug, view, and public folders
app.set("views", path.join(__dirname, "views"))
app.set("view engine", "pug")
app.use(express.static(path.join(__dirname, "public")));


// config express-session
const sess = {
  secret: 'sdajlkfjsalLfjeaKjfeaJfjeiaofea',
  cookie: {},
  resave: false,
  saveUninitialized: false
}

if (app.get('env') === 'production') {
  // Use secure cookies in production (requires SSL/TLS)
  sess.cookie.secure = true
}

app.use(session(sess))

/**
 * Routes Definitions
 */

// session middleware
const secured = (req, res, next) => {
  if (req.user) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect("/login");
};

// defined routes
app.get("/", (req, res) => {
  res.render("index", { title: "Home" })
})

app.get("/user", secured, (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  res.render("user", {
    title: "Profile",
    userProfile: userProfile
  });
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Login" })
})

app.get("/logout", (req, res) => {
  req.user = null
  res.redirect("/")
})

/**
 * Server Activation
 */

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`)
})
