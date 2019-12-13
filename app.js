// ---------- Begin of Imports ----------

var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');
var time = require('time');
var url = require('url');
var crypto = require('crypto');

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
  res.render('index.ejs', {rooms : rooms});
});

// Routing for creating a new room
app.post('/newroom', function(req, res) {
  // Create a random string to use as the rooms id
  let roomId = crypto.randomBytes(3*4).toString('base64');
  // Ensure it isn't a duplicate id (Altough chance incredibly small, still possible)
  while (roomIds.includes(roomId)) roomId = crypto.randomBytes(3*4).toString('base64');
  rooms.push(new Room(roomId));
  roomIds.push(roomId);
  res.send('/watch/' + roomId);
});

// Routing for the page where clients can watch videos together
app.get(new RegExp('/watch/(.+)'), function(req, res) {
  res.render('roomWatch.ejs', {});
});

// Routing for the page where users can see all rooms
app.get('/watch', function(req, res) {
  res.render('watch.ejs', { rooms : rooms });
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

// Class for rooms
class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.lastDuration = 0;
    this.lastDurationTime = 0;
    this.countDuration = false;
    this.lastId = 'hMAPyGoqQVw';
    this.lastState = 2;
    this.connectedClients = 0;
  }
}

// An array containing all rooms
let rooms = [new Room('a'), new Room('b')];
// An array containing all ids of the existing rooms
let roomIds = ['a', 'b'];

// Socket functions

// Gets called when a new clients connects to the socket
watch.on('connection', function(socket) {
  // The room to which the client is connected
  let room = url.parse(socket.handshake.url, true).query.ns;
  // Disconnect the user if he joins from an invalid room
  if (!roomIds.includes(room)) {
    socket.disconnect();
    return;
  }
  else socket.join(room);
  // Get the object of the users room
  let roomObject = rooms[roomIds.indexOf(room)];
  // Increment the amount of connected clients when a new client connects
  roomObject.connectedClients++;
  socket
  // Gets called by clients when they want to sync the videoId of their player to the ones of the other clients
  .on('requestVideoSync', function() {
    socket.emit('videoChange', roomObject.lastId);
  })
  // Gets called by clients when they want to sync the state of their player to the ones of the other clients
  .on('requestStateSync', function() {
    socket.emit('stateChange', roomObject.lastState);
  })
  // Gets called by clients when they want to sync the time of their player to the ones of the other clients
  .on('requestTimeSync', function() {
    // Calculating the time to send to the client
    let duration;
    if (roomObject.countDuration) duration = roomObject.lastDuration + time.time() - roomObject.lastDurationTime;
    else duration = roomObject.lastDuration;
    socket.emit('timeChange', duration);
  })
  // Gets called whenever the state of one of the clients players changes
  .on('stateChange', function(state, duration) {
    socket.broadcast.to(room).emit('stateChange', state);
    roomObject.lastState = state;
    // If the new state is playing
    if (state === 1) {
      roomObject.countDuration = true;
      roomObject.lastDuration = duration;
      roomObject.lastDurationTime = time.time();
    }
    // If the new state is paused
    else if (state === 2) roomObject.countDuration = false;
  })
  // Gets called whenever a client changes the time of their video
  .on('timeChange', function(data) {
    socket.broadcast.to(room).emit('timeChange', data);
    // Set lastDuration to the current time sent by the user
    roomObject.lastDuration = data;
    // Set the last time whewn the duration was updated to the current time
    roomObject.lastDurationTime = time.time();
  })
  // Gets called whenever a user requests a new video
  .on('videoChange', function(id) {
    // Refresh the last id
    roomObject.lastId = id;
    // Reset lastDuration and countDuration
    roomObject.lastDuration = 0; roomObject.countDuration = false;
    // Send the video id to all other users
    socket.broadcast.to(room).emit('videoChange', id);
  })
  // Decrement the amount of connected clients when one disconnects
  .on('disconnect', function() {
    roomObject.connectedClients--;
    /*

      TODO: close room when no clients are connected

    */
    // Reset important variables when noone is connected
    if (roomObject.connectedClients === 0) {
      roomObject.countDuration = false;
      roomObject.lastDuration = 0;
      roomObject.lastState = 2;
    }
  });
});
