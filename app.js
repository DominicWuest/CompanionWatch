// ---------- Begin of Imports ----------

var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');
var time = require('time');

// ----------- End of Imports -----------

// Listen on the port 3000
server.listen(3000);

// Directory for static files
app.use(express.static('public'));
// Static directory for ejs files
app.set('views', path.join(__dirname, 'public/views'));
// Set the view engine to ejs
app.set('view engine', 'ejs');

// Routing for the homepage
app.get('/', function(req, res) {
  res.render('index.ejs', {});
});

// Routing for the page where clients can watch videos together
app.get('/watch', function(req, res) {
  res.render('watch.ejs', {})
});

// Namespace for /watch
var watch = io.of('/watch')

// An integer indicating the time of the video which has passed when the last timeChange was recorded
let lastDuration = 0;
// An integer indicating the time when the last timeChange was recorded
let lastDurationTime = 0;
// An integer indicating the amount of clients which are connected
let connectedClients = 0;

// Gets called when a new clients connects to the socket
watch.on('connection', function(socket) {
  // Increment the amount of connected clients when a new client connects
  connectedClients++;
  socket
  // Gets called whenever the state of one of the clients players changes
  .on('stateChange', function(data) {
    socket.broadcast.emit('stateChange', data);
  })
  // Gets called whenever a client changes the time of their video
  .on('timeChange', function(data) {
    socket.broadcast.emit('timeChange', data);
    // Set lastDuration to the current time sent by the user
    lastDuration = data;
    // Set the last time whewn the duration was updated to the current time
    lastDurationTime = time.time();
  })
  // Gets called by clients when they want to sync the time of the video of their player to the ones of the other clients
  .on('requestTimeSync', function() {
    if (connectedClients === 1) socket.emit('timeChange', 0);
    // Sends the current time of the player to the client which requested it
    else socket.emit('timeChange', lastDuration + time.time() - lastDurationTime);
  })
  // Decrement the amount of connected clients when one disconnects
  .on('disconnect', function() { connectedClients--; });
});
