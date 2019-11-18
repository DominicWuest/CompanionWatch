var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');

server.listen(3000);

// Directory for static files
app.use(express.static('public'));
// Static directory for ejs files
app.set('views', path.join(__dirname, 'public/views'));
// Set the view engine to ejs
app.set('view engine', 'ejs');

app.get('/', function(req, res) {
  res.render('index.ejs', {});
});

app.get('/bulletin', function(req, res) {
  res.render('bulletin.ejs', {})
});

var chat = io
  .of('bulletin')
  .on('connection', function(socket) {
    socket.on('message', function(name, message) {
      
    })
  });
