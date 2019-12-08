// index.js

/**
 * Required External Modules
 */

const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const winston = require("winston");
require("dotenv").config();

/**
 * App Variables
 */

const app = express();
const port = process.env.PORT || "8000";

// set default user
const defaultUser = {
  username: "",
  password: "",
  loggedIn: false,
  json: {},
  time: {
    in: 0,
    elap: 0,
  }
}

// logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'user-log' },
  transports: [
    //
    // - Write to all logs with level `info` and below to `quick-start-combined.log`.
    // - Write all logs error (and below) to `quick-start-error.log`.
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

//
// If we're not in production then **ALSO** log to the `console`
// with the colorized simple format.
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// important urls
const loginUrl = "https://aspen.cps.edu/aspen/logon.do"
//const homeUrl = "https://aspen.cps.edu/aspen/home.do"
const desktopGradesUrl = "https://aspen.cps.edu/aspen/portalClassList.do?navkey=academics.classes.list"
const gradesExt = "list/academics.classes.list"
const fullSiteExt = "redirect?page=fullsite"

/* key names */
const mobileKeys = [
  "class",
  "teacher",
  "average"
]

const keys = [
  "class",
  "teacher",
  "semester",
  "period",
  "room",
  "average",
  "absences",
  "tardies"
]

/**
 *  App Configuration
 */

// define views folder
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

// define public folder
app.use(express.static(path.join(__dirname, "public")));

// config body-parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// config cookie-parser
app.use(cookieParser())

// config express-session
app.use(session({
  secret: 'fy7e89afe798wa',
  resave: false,
  saveUninitialized: false,
  user: defaultUser
}))

// initialize session
app.use((req, res, next) => {
  if (!req.session.initialised) {
    req.session.initialised = true;
    req.session.user = defaultUser;
  }
  next();
});

const iPhone = puppeteer.devices["iPhone 6"]

// initialize puppeteer
let browser, page
(async () => {
  browser = await puppeteer.launch({ headless: (process.env.NODE_ENV == "production") })
  page = await browser.newPage()
  await page.emulate(iPhone)
  await page.goto(loginUrl)
})()

/**
 * Routes Definitions
 */

// welcome page
app.get("/", (req, res) => {
  let user = req.session.user
  // check for authentication
  if (user.loggedIn) {
    // user is logged in
    res.render("index", { title: "Home", user: user });
  } else {
    // redirect to login
    res.redirect("/login")
  }
});

app.get("/login", (req, res) => {
  // reset user
  let user = req.session.user
  user = defaultUser

  let err = req.query.err
  if (!err) {
    res.render("login", { title: "Welcome", user: user });
  } else {
    res.render("login", { title: "Welcome", user: user, err: err });
  }
})

// login handler
app.post("/login", (req, res) => {
  // reset user
  let user = req.session.user
  user = defaultUser

  // get login info
  const username = req.body.username;
  const password = req.body.password;

  if (username && password) {
    // save login to session
    let user = req.session.user
    user.username = username
    user.password = password
    // get start time
    user.time.in = new Date().getTime()

    auth(user).then(success => {
      if (success) {
        user.time.elap = (new Date().getTime() - user.time.in) / 1000
        res.redirect("/")
      } else {
        res.redirect(`/login?err=${"Invalid username and/or password"}`)
      }
      return success
    }).then(success => {
      //if (success) {}
      return fetchGrades(user)
    }).then(() => {
      req.session.save()
    }).catch(err => { console.log(err) })

  } else {
    // show err
    let err = "Please enter a username and password"
    console.log(err)
    res.redirect(`/login?err=${err}`)
  }
});

app.get("/logout", async (req, res) => {
    req.session.destroy()
    //req.session.user = defaultUser
    await res.redirect("/")
})

app.get("/grades", (req, res) => {
  let user = req.session.user
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    if (user.json.length) {
      res.render("grades", { title: "Grades", user: user })
    } else {
      setTimeout(() => {
        res.redirect("/grades")
      }, 500)
    }
  }
})

app.get("/class", (req, res) => {
  let user = req.session.user
  let index = req.query.index
  if (!user.loggedIn || !index) {
    res.redirect("/")
  } else {
    res.render("class", { title: "Class", user: user, index: index })
  }
})

app.get("/assignments", (req, res) => {
  let user = req.session.user
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    res.render("grades", { title: "Grades", user: user })
  }
})

app.get("/me", (req, res) => {
  let user = req.session.user
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    res.render("grades", { title: "Grades", user: user })
  }
})

// auth/crawl function (it's a doozy)
async function auth(user) {
  let success = 0
  // log in
  if (await page.url() != loginUrl) { await page.goto(loginUrl) }
  else {
    await page.evaluate(function() {
      document.getElementById("username").value = ""
      document.getElementById("password").value = ""
    })
  }
  await page.type('#username', user.username)
  await page.type('#password', user.password)
  await Promise.all([
    page.click('input.primary.button'),
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
  ]);

  // determine if login succeeded
  let location = await page.url()
  if (location !== loginUrl) {
    console.log("Login successful!")
    success = 1
    logger.log({
      level: 'info',
      message: 'User logged in',
      user: user.username,
    });
    user.loggedIn = true
  } else {
    console.log("Login failed!")
  }
  return success
}

async function fetchGrades(user) {
  // init json
  let mobileJSON = []

  // visit grades page
  let homeUrl = await page.url()
  let gradesUrl = homeUrl + gradesExt
  await page.goto(gradesUrl)
  await page.waitForSelector(".ui-grid-row")
  let $ = await cheerio.load(await page.content());
  let row = 0, index = 0
  await $(".ui-grid-row").each(function(i, el) {
    index = 0
    mobileJSON.push({})
    let gridRow = $(this)
    $(".ui-grid-cell", gridRow).each(function(i, el) {
      let cell = $(this)
      let data = trimString(cell.text())
      if (index == 2) {
        data = data.split(" ")[0]
      }
      mobileJSON[row][mobileKeys[index]] = data
      index++
    })
    row++
  })

  // get full site
  let json = []
  await page.goto(desktopGradesUrl)
  row = 0, index = 0
  $ = await cheerio.load(await page.content());
  await $("#dataGrid .listCell").each(function(i, el) {
    json.push({})
    index = -1
    let gridRow = $(this)
    $("td", gridRow).each(function(i, el) {
      if (index >= 0) {
        // do something here
        let cell = $(this)
        let data = trimString(cell.text())
        if (data) {
          json[row][keys[index]] = data
        } else {
          json[row][keys[index]] = ""
        }
      }
      index++
    })
    row++
  })

  // edit averages from mobileJSON
  for (let i = 0; i < json.length; i++) {
    // find average from current class
    let mobileClass = mobileJSON.find(function(el) {
      return el["class"] == json[i]["class"]
    })
    json[i]["average"] = mobileClass["average"]
  }

  user.json = json
  console.log("Fetched grades!")
  return user
}

// helper function that trims whitespace and newline characters from the inside of strings
const trimString = function(string) {
  let split = string.split(" ");
  let currentItem = "";
  let newSplit = [];
  for (let i = 0; i < split.length; i++) {
    if (split[i]) {
      currentItem = split[i].trim();
      if (currentItem) {
        newSplit.push(currentItem);
      }
    }
  }
  return newSplit.join(" ");
};

/**
 * Server Activation
 */

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});
