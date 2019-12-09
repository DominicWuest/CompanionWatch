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
  res.render('watch.ejs', {});
});

// Namespace for /watch
var watch = io.of('/watch')

// An integer indicating the time of the video which has passed when the last timeChange was recorded
let lastDuration = 0;
// An integer indicating the time when the last timeChange was recorded
let lastDurationTime = 0;
// A boolean indicating whether the video kept playing since the last time the duration was updated
let countDuration = false;
// A string indicating the id of the last requested video
let lastId = 'hMAPyGoqQVw';
// An integer indicating the last recorded state
let lastState = 2;
// An integer indicating the amount of clients which are connected
let connectedClients = 0;

// Class for room
class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.lastDuration = 0;
    this.lastDurationTime = 0;
    this.countDuration = false;
    this.videoId = 'hMAPyGoqQVw';
    this.lastState = 2;
    this.connectedClients = 0;
  }
}

// Socket functions

// Gets called when a new clients connects to the socket
watch.on('connection', function(socket) {
  // Increment the amount of connected clients when a new client connects
  connectedClients++;
  socket
  // Gets called by clients when they want to sync the videoId of their player to the ones of the other clients
  .on('requestVideoSync', function() {
    socket.emit('videoChange', lastId);
  })
  // Gets called by clients when they want to sync the state of their player to the ones of the other clients
  .on('requestStateSync', function() {
    socket.emit('stateChange', lastState);
  })
  // Gets called by clients when they want to sync the time of their player to the ones of the other clients
  .on('requestTimeSync', function() {
    // Calculating the time to send to the client
    let duration;
    if (countDuration) duration = lastDuration + time.time() - lastDurationTime;
    else duration = lastDuration;
    socket.emit('timeChange', duration);
  })
  // Gets called whenever the state of one of the clients players changes
  .on('stateChange', function(state, duration) {
    socket.broadcast.emit('stateChange', state);
    lastState = state;
    // If the new state is playing
    if (state === 1) {
      countDuration = true;
      lastDuration = duration;
      lastDurationTime = time.time();
    }
    // If the new state is paused
    else if (state === 2) countDuration = false;
  })
  // Gets called whenever a client changes the time of their video
  .on('timeChange', function(data) {
    socket.broadcast.emit('timeChange', data);
    // Set lastDuration to the current time sent by the user
    lastDuration = data;
    // Set the last time whewn the duration was updated to the current time
    lastDurationTime = time.time();
  })
  // Gets called whenever a user requests a new video
  .on('videoChange', function(id) {
    // Refresh the last id
    lastId = id;
    // Reset lastDuration and countDuration
    lastDuration = 0; countDuration = false;
    // Send the video id to all other users
    socket.broadcast.emit('videoChange', id);
  })
  // Decrement the amount of connected clients when one disconnects
  .on('disconnect', function() {
    connectedClients--;
    // Reset important variables when noone is connected
    if (connectedClients === 0) {
      countDuration = false;
      lastDuration = 0;
      lastState = 2;
    }
  });
});
