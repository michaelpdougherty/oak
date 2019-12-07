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
  json: {}
}

// set browser objs and urls
let browser = null, page = null, content = null, location = null
const loginUrl = "https://aspen.cps.edu/aspen/logon.do"
const homeUrl = "https://aspen.cps.edu/aspen/home.do"
const gradesUrl = "https://aspen.cps.edu/aspen/portalClassList.do?navkey=academics.classes.list"

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
if (true){//process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

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

// initialize and refresh browser
async function refreshBrowser() {
  try {
    if (page)
      location = await page.url()
    if (!browser) {
      browser = await puppeteer.launch();
      page = await browser.newPage();
      await page.goto(loginUrl)
      location = await page.url();
      await console.log("refreshBrowser: initialize at " + location)
    } else if (location != loginUrl && await location.split(";") < 2) {
      let old = await page.url()
      await page.goto(loginUrl)
      let current = await page.url()
      await console.log(`refreshBrowser: move from ${old} to ${current}`)
    }
  } catch (err) { console.log(`refreshBrowser: ${err}`) }
}

// initialize and restart browser
async function restartBrowser() {
  try {
    // set all variables to null
    browser = null
    content = null
    page = null
    location = null
    browser = await puppeteer.launch();
    page = await browser.newPage();
    await page.goto(loginUrl)
    location = await page.url();
    await console.log("restartBrowser: initialize at " + location)
  } catch (err) { console.log(`restartBrowser: ${err}`) }
}

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
app.post("/login", async (req, res) => {
  // reset user and browser
  let user = req.session.user
  user = defaultUser
  await restartBrowser()

  // get login info
  const username = req.body.username;
  const password = req.body.password;

  if (username && password) {
    // save login to session
    let user = req.session.user
    user.username = username
    user.password = password;

    await auth(user).then(success => {
      if (success) {
        res.redirect("/")
        restartBrowser()
      } else {
        res.redirect(`/login?err=${"Invalid username and/or password"}`)
      }
    }).catch(err => { console.log(err) })

  } else {
    // show err
    let err = "Please enter a username and password"
    console.log(err)
    await res.redirect(`/login?err=${err}`)
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
    res.render("grades", { title: "Grades", user: user })
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

// auth function
async function auth(user) {
  let success = 0
  await page.type('#username', user.username)
  await page.type('#password', user.password)
  await Promise.all([
    page.click('#logonButton'),
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
  ]);
  location = await page.url()
  if (location == homeUrl || await location.split(";") > 1) {
    await console.log("Login successful!")
    await logger.log({
      level: 'info',
      message: 'User logged in',
      user: user.username,
    });
    user.loggedIn = true
    await page.goto(gradesUrl)

    let $ = await cheerio.load(await page.content());
    let json = [];
    let a = [];

    while (json.length < 9) {
      await json.push({
        class: "",
        href: "",
        teacher: "",
        semester: "",
        period: "",
        room: "",
        average: "",
        absences: "",
        tardies: ""
      });
    }

    const keys = [
      "class",
      "href",
      "teacher",
      "semester",
      "period",
      "room",
      "average",
      "absences",
      "tardies"
    ];

    // parse every td for raw characters
    let column = -1;
    await $("#dataGrid tr").filter(function(i, el) {
      if (!json[column]) { json = pushRow(json) }
      let index = 0;
      // skip header column
      if (column > -1) {
        // get tr children (td's)
        let children = this.children;
        if (children) {
          // get # of children and iterate over them
          let length = children.length;
          for (let i = 0; i < length; i++) {
            let child = children[i];
            if (child) {
              // if child is td, investigate further
              if (child.name == "td") {
                let gChildren = child.children;
                if (gChildren) {
                  // get # of grandchildren and iterate over them
                  let gLength = gChildren.length;
                  for (let j = 0; j < gLength; j++) {
                    let gChild = gChildren[j];

                    // get class name and link
                    if (gChild.name == "a") {
                      let className = gChild.children[0].data;
                      if (className) {
                        className = trimString(className);
                        json[column][keys[index]] = className;
                        //a.push(gChild)
                        index++;
                      }

                      let href = gChild.attribs.href;
                      if (href) {
                        json[column][keys[index]] = href;
                        index++;
                      }
                    }
                    // eliminate whitespace in data
                    let data = gChild.data;
                    if (data) {
                      data = data.trim();
                      if (data) {
                        json[column][keys[index]] = data;
                        index++;
                      } else if ((json[column]["class"] == "Student Meal" && (index == 2 || (index >= 6 && index <= 8))) || (json[column]["period"][0] == "H" && keys[index] == "average") ) {
                          index++;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      column++;
    });

    //user.a = a
    user.json = json

    success = 1
  } else {
    await console.log("Login failed!")
  }
  return success
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

const pushRow = function(json) {
  json.push({
    class: "",
    href: "",
    teacher: "",
    semester: "",
    period: "",
    room: "",
    average: "",
    absences: "",
    tardies: ""
  });
  return json
}

/**
 * Server Activation
 */

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});
