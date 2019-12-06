var proxy = require('express-http-proxy');
var app = require('express')()
 
app.use('/proxy', proxy('www.google.com'));

app.get('/', function (req, res) {
  res.send('hello world!')
})

app.listen(8000, function() {
  console.log("App listening on port 8000!")
})
