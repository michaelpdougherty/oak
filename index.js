// index.js

/**
 * Required External Modules
 */

const bodyParser = require("body-parser")
const cheerio = require("cheerio")
const dotenv = require("dotenv").config()
const express = require("express")
const fs = require("fs")
const https = require("https")
const path = require("path")
const puppeteer = require("puppeteer")
const redis = require("redis")
const session = require("express-session")
const sleep = require('util').promisify(setTimeout)
const uuidv1 = require("uuid/v1")
const winston = require("winston")

/**
 * App Variables
 */

const app = express();

// initialize logger
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

// URLs for scraping
const loginUrl = "https://aspen.cps.edu/aspen/logon.do"
const desktopGradesUrl = "https://aspen.cps.edu/aspen/portalClassList.do?navkey=academics.classes.list"
const gradesExt = "list/academics.classes.list"
const fullSiteExt = "redirect?page=fullsite"

// key names
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

const mobileKeys = [
  "class",
  "teacher",
  "average"
]

const assignmentKeys = [
  "checkbox",
  "assignmentName",
  "dateAssigned",
  "dateDue",
  "categoryDesc",
  "categoryWeight",
  "altAssignmentName",
  "longScore",
  "percentage",
  "fraction",
  "totalScore"
]


// session store
let RedisStore = require("connect-redis")(session)
let client = redis.createClient()

// last login variable
let lastLoginTime = Date.now()

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

// config express-session
app.use(session({
  store: new RedisStore({ client }),
  genid: function(req) {
    return uuidv1() // use UUIDs for session IDs
  },
  secret: 'fy7e89afe798wa',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 100 * 60 * 1000, // 100 min
    secure: (process.env.NODE_ENV == "production")
  }
}))

// initialize session
app.use((req, res, next) => {
  if (!req.session.initialised) {
    req.session.initialised = true;
    req.session.user = {
      username: "",
      password: "",
      loggedIn: false,
      json: [],
      assignments: [],
      time: {
        in: 0,
        elap: 0,
      },
      tabIndex: 0
    };
  }
  next();
});

const iPhone = puppeteer.devices["iPhone 6"]

// initialize puppeteer
let browser, browserStartTime
let pages = []
let browsers = []
let browserInUse = false;

async function pushPage () {
  let i = pages.length
  await browsers.push(await puppeteer.launch({ headless: !(process.env.HEAD), args: ["--no-sandbox", "--disable-setuid-sandbox"] }))
  await pages.push(await browsers[i].newPage())
  await pages[i].emulate(iPhone)
  await pages[i].goto(loginUrl, { waitUntil: "domcontentloaded" })
  return i
}
pushPage()


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
    if (req.query.err) {
      res.render("login", { title: "Login", err: req.query.err })
    } else {
      res.render("login", { title: "Login" })
    }
  }
});


// deprecated login route
app.get("/login", (req, res) => {
  res.redirect("/")
})

// login handler
app.post("/login", async (req, res) => {
  // ensure minimum delay between logins (may be unnecessary)
  let currentTime = await Date.now()
  if (currentTime - lastLoginTime < 3000) {
    console.time("Slept for")
    await sleep(3000)
    console.timeEnd("Slept for")
  }
  lastLoginTime = currentTime

  // get login info
  let username = req.body.username;
  let password = req.body.password;

  // ensure username and password are given
  if (username && password) {
    // save login to session
    let user = req.session.user
    user.username = username
    user.password = password

    // get start time
    user.time.in = await Date.now();

    try {
      // authorize login
      await auth(user);
      if (user.loggedIn) {
        // redirect to main page
        user.time.elap = (await Date.now() - user.time.in) / 1000
        await res.redirect("/")
      } else {
        // otherwise, show error
        await res.redirect(`/?err=${"Invalid username and/or password"}`)
      }
      // get user grades and save them to the session
      await fetchGrades(user);
      await req.session.save();

      // get user assignments and save them to the session
      await fetchAssignments(user);
      await req.session.save();
    } catch (err) {
      // log any errors
      console.log(err)
    }

  } else {
    // show err and redirect
    let err = "Please enter a username and password"
    console.log(err)
    res.redirect(`/?err=${err}`)
  }
});

// logout handler
app.get("/logout", (req, res) => {
  req.session.destroy(function(err) {
    if (err) {
      console.log(err)
    }
    res.redirect("/")
  })
})

// display user grades
app.get("/grades", (req, res) => {
  // get user
  let user = req.session.user

  // ensure user is logged in
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    // ensure grades have been gotten
    if (user.json.length) {
      // show page
      res.render("grades", { title: "Grades", user: user })
    } else {
      // try again after a delay
      setTimeout(() => {
        res.redirect("/grades")
      }, 350)
    }
  }
})

// individual class page
app.get("/class", (req, res) => {
  // get user
  let user = req.session.user
  let index = req.query.index

  // ensure user is logged in and class index is specified
  if (!user.loggedIn || !index) {
    res.redirect("/")
  } else {
    res.render("class", { title: "Class", user: user, index: index })
  }
})

// show user assignments
app.get("/waitForAssignments", (req, res) => {
  // get user
  let user = req.session.user

  // ensure user is logged in
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    // check if assignments fetched yet
    if (user.assignments.length) {
      res.render("assignments", { title: "Assignments", user: user })
    } else {
      setTimeout(() => {
        res.redirect("/waitForAssignments")
      }, 600)
    }
  }
})

app.get("/assignments", (req, res) => {
  // get user
  let user = req.session.user

  // ensure user is logged in
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    // check if assignments fetched
    if (user.assignments.length) {
      // render assignments page
      res.render("assignments", { title: "Assignments", user: user })
    } else if (user.json.length) {
      res.render("waitForAssignments", { title: "Assignments", user: user })
    } else {
      // try again after a delay
      setTimeout(() => {
        res.redirect("/assignments")
      }, 350)
    }
  }
});

app.get("/classAssignments", (req, res) => {
  // get user and class index
  let user = req.session.user
  let classIndex = req.query.c

  // ensure user is logged in
  if (!(user.loggedIn && classIndex)) {
    res.redirect("/")
  } else {
    // check if assignments fetched
    if (user.assignments.length) {
      // render assignments page
      res.render("classAssignments", { title: "Assignments", user: user, c: classIndex })
    } else {
      // try again after a delay
      setTimeout(() => {
        res.redirect(req.originalUrl)
      }, 500)
    }
  }
});

// individual assignment page
app.get("/assignment", (req, res) => {
  // get user
  console.log(req.originalUrl)
  let user = req.session.user
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    // get indexes for specific assignment
    let classIndex = req.query.class
    let assignmentIndex = req.query.assignment

    // ensure they exist, otherwise redirect
    if (!(classIndex && assignmentIndex)) {
      res.redirect("/assignments")
    } else {
      // render assignment page
      res.render("assignment", { title: "Assignment", user: user, classIndex: classIndex, assignmentIndex: assignmentIndex })
    }
  }
})

// individual assignment page
app.get("/classAssignment", (req, res) => {
  // get user
  let user = req.session.user
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    // get indexes for specific assignment
    let classIndex = req.query.class
    let assignmentIndex = req.query.assignment

    // ensure they exist, otherwise redirect
    if (!(classIndex && assignmentIndex)) {
      res.redirect("/classAssignments")
    } else {
      // render assignment page
      res.render("classAssignment", { title: "Assignment", user: user, classIndex: classIndex, assignmentIndex: assignmentIndex })
    }
  }
})


/* personal information tab, coming soon
app.get("/me", (req, res) => {
  let user = req.session.user
  if (!user.loggedIn) {
    res.redirect("/")
  } else {
    res.render("grades", { title: "Grades", user: user })
  }
})
*/

// function to authorize user login and begin session
async function auth(user) {
  // default to first tab
  let currentIndex = 0

  // determine when browser was set to use
  if (((await Date.now() - browserStartTime) / 1000) > 100) { browserInUse = false }

  // determine if browser is currently in use and began more than 60 seconds ago
  if (browserInUse) {
      // open additional pages
      currentIndex = await pushPage()
  }
  // set browser to be in use
  browserInUse = true

  // set tab index for user
  user.tabIndex = currentIndex

  // log in; if browser is not at login page, go, otherwise, clear inputs
  if (await pages[currentIndex].url() != loginUrl) { await pages[currentIndex].goto(loginUrl, { waitUntil: "domcontentloaded" }) }
  else {
    await pages[currentIndex].evaluate(function() {
      document.getElementById("username").value = ""
      document.getElementById("password").value = ""
    })
  }

  // type login information into page and click submit
  await pages[currentIndex].type('#username', user.username)
  await pages[currentIndex].type('#password', user.password)
  await Promise.all([
    pages[currentIndex].click('input.primary.button'),
    pages[currentIndex].waitForNavigation({ waitUntil: 'networkidle0' }),
  ]);

  // determine if login succeeded based on new url
  let location = await pages[currentIndex].url()
  let splitL = location.split("/")
  if (splitL[splitL.length-2] == "#") {
    // log success
    console.log(new Date().toLocaleString("en-US") + ": Login successful!")
    console.log(`User: ${user.username}`)
    logger.log({
      level: 'info',
      message: 'User logged in',
      user: user.username,
      elapsedTime: user.time.elap
    });

    // set user to logged in
    user.loggedIn = true
  } else {
    // login failure, return to login url if first page
    if (currentIndex == 0) {
      await pages[currentIndex].goto(loginUrl, { waitUntil: "domcontentloaded" })
      browserInUse = false
    // otherwise close page and browser
    } else {
      await pages[currentIndex].close()
      await browsers[currentIndex].close()
    }
    // log failure
    console.log(Date.now() + ": Login failed!")
  }
}

async function fetchGrades(user) {
  // only run if user was logged in successfully
  if (user.loggedIn) {
    // init json
    let mobileJSON = []
    let currentIndex = user.tabIndex

    // visit grades page and wait for Angular to load
    let homeUrl = await pages[currentIndex].url()
    let gradesUrl = homeUrl + gradesExt
    await pages[currentIndex].goto(gradesUrl, { waitUntil: "domcontentloaded" })
    await pages[currentIndex].waitForSelector(".ui-grid-row")

    // get page as cheerio obj
    let $ = await cheerio.load(await pages[currentIndex].content());

    // iterate over rows and cols in grid
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

        // insert data into json
        mobileJSON[row][mobileKeys[index]] = data
        index++
      })
      row++
    })

    /* NOTE: desktop json should be the same length as mobile json, but making
     * that assumption might just cause trouble
     */

    // get desktop site
    let json = []

    // go to assignments page, ignoring what I think is a PDF err
    try {
      await pages[currentIndex].goto(desktopGradesUrl, { waitUntil: "domcontentloaded" })
    } catch (err) {}

    // iterate over rows and columns in desktop page
    row = 0, index = 0
    $ = await cheerio.load(await pages[currentIndex].content());
    await $("#dataGrid .listCell").each(function(i, el) {
      // push new row to json
      json.push({})

      // starting at -1 to avoid header row
      index = -1
      let gridRow = $(this)
      $("td", gridRow).each(function(i, el) {
        if (index >= 0) {
          let cell = $(this)
          let data = trimString(cell.text())
          if (data) {
            // insert data into json
            json[row][keys[index]] = data
          } else {
            // pass over empty cells
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

    // add grades to session and log
    user.json = json
    console.log("Fetched grades!")
  }
}

// fetch user assignments
async function fetchAssignments(user) {
  // only run if user is logged in
  if (user.loggedIn) {
    // get index of current page
    let currentIndex = user.tabIndex

    // init vars
    let assignments = [], $ = 0, row = 0, index = 0, classNum = 0

    // begin assignments slideshow and wait for redirect
    await Promise.all([
      pages[currentIndex].click('a[title="List of assignments"]'),
      pages[currentIndex].waitForNavigation({ waitUntil: 'networkidle0' }),
    ]);

    // select "all" dropdown and wait for load
    // 'select[name="gradeTermOid"]'
    await pages[currentIndex].select('select[name="gradeTermOid"]', '')
    await pages[currentIndex].waitFor(500)

    // iterate over all classes
    for (let i = 0; i < user.json.length - 1; i++) {
      $ = await cheerio.load(await pages[currentIndex].content())
      row = 0, index = 0
      await assignments.push([])

      // iterate over rows and columns in table
      await $(".listCell").each(function(i, el) {
        index = 0
        assignments[classNum].push({})
        let gridRow = $(this)
        $("td", gridRow).each(function(i, el) {
          let cell = $(this)
          let data = trimString(cell.text())
          // empty row if page reads as such
          if (data == "No matching records") {
            assignments[classNum] = []
          } else if (assignmentKeys[index] !== "checkbox" && assignmentKeys[index] !== "altAssignmentName" && assignmentKeys[index] !== "longScore" && index < 11) {
            // otherwise, insert data into json
            assignments[classNum][row][assignmentKeys[index]] = data
          }
          index++
        })
        row++
      })
      classNum++

      // get next page and wait for navigation
      if (await pages[currentIndex].$('#nextButton')) {
        await Promise.all([
          pages[currentIndex].click('#nextButton'),
          pages[currentIndex].waitForNavigation({ waitUntil: 'networkidle0' }),
        ]);
      }
    }

    // add assignments to session and log
    user.assignments = assignments
    console.log("Fetched assignments!")

    // close browser window on completion if add'l ones were opened
    if (currentIndex != 0) {
      await pages[currentIndex].close()
      await browsers[currentIndex].close()
    } else {
      // otherwise, return to the login page and reset var
      await pages[currentIndex].goto(loginUrl, { waitUntil: "domcontentloaded" })
      browserInUse = false
    }
  }
}

// helper function that trims whitespace and newline characters from the inside of strings
// this thing is a LIFESAVER
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

// define port
const port = process.env.PORT || "8000";

// begin server with https certs or not, depending on environment
if (process.env.NODE_ENV == "production") {
  https.createServer({
    key: fs.readFileSync(process.env.KEY),
    cert: fs.readFileSync(process.env.CER)
  }, app).listen(port, () => {
    console.log("Listening to requests on https://oakgrades.com");
  });
} else {
  app.listen(port, () => {
    console.log(`Listening to requests on http://localhost:${port}`);
  });
}
