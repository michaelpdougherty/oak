// index.js

/**
 * Required External Modules
 */

const express = require("express")
const path = require("path")

const expressSession = require("express-session")
const passport = require("passport")
const Auth0Strategy = require("passport-auth0")

require("dotenv").config()

const authRouter = require("./auth")

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

app.use(expressSession(sess))

// Configure passport to use Auth0
const strategy = new Auth0Strategy(
  {
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL:
      process.env.AUTH0_CALLBACK_URL || "http://localhost:3000/callback"
  },
  function (accessToken, refreshToken, extraParams, profile, done) {
    return done(null, profile)
  }
)

passport.use(strategy)

app.use(passport.initialize())
app.use(passport.session())

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.use((req, res, next) => {
  res.locals.isAuthenticated = req.isAuthenticated()
  next()
})

app.use("/", authRouter)

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

app.get("/logout", (req, res) => {
  res.redirect("/")
})

/**
 * Server Activation
 */

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`)
})
