// ---------- Begin of Imports ----------

var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');
var time = require('time');
var url = require('url');
var crypto = require('crypto');
var axios = require('axios');

// ----------- End of Imports -----------

// Listen on the port 3000
server.listen(3000);

// Directory for static files
app.use(express.static('public'));
// Static directory for ejs files
app.set('views', path.join(__dirname, 'public/views'));
// Set the view engine to ejs
app.set('view engine', 'ejs');

// The url to which the request has to be sent in order to receive infos about videos by id
const videoInfoUrl = 'https://www.googleapis.com/youtube/v3/videos';
// The url to which the request has to be sent in order to search for videos
const videoSearchUrl = 'https://www.googleapis.com/youtube/v3/search';
// The parameters for the query
const videoSearchParams = '&safeSearch=none&type=video&videoEmbeddable=true&maxResults=30';
// The api-key for the project
const apiKey = ***REMOVED***;

// Routing for the homepage
app.get('/', function(req, res) {
  res.render('index.ejs', { rooms : rooms });
});

// Routing for creating a new room
app.post('/newroom', function(req, res) {
  // Create a random string to use as the rooms id
  let roomId = crypto.randomBytes(3*4).toString('hex');
  // Ensure it isn't a duplicate id (Altough chance incredibly small, still possible)
  while (roomIds.includes(roomId)) roomId = crypto.randomBytes(3*4).toString('base64');
  // Create the new room object and push it to the rooms and its id to the roomIds array
  let newRoom = new Room(roomId);
  rooms.push(newRoom);
  roomIds.push(roomId);
  // Get and update the snippet for the video playing in the room
  axios.get(videoInfoUrl + '?part=snippet&key=' + apiKey + '&id=' + newRoom.lastId).then(data => newRoom.snippet = data.data.items[0].snippet);
  res.send('/watch/' + roomId);
});

// Routing for the page where clients can watch videos together
app.get(new RegExp('/watch/(.+)'), function(req, res) {
  res.render('roomWatch.ejs', {});
});

// Namespace for /watch
var watch = io.of('/watch')

// Class for rooms
class Room {
  constructor(roomId) {
    // The id of the room
    this.roomId = roomId;
    // An integer indicating the time of the video which has passed when the last timeChange was recorded
    this.lastDuration = 0;
    // An integer indicating the time when the last timeChange was recorded
    this.lastDurationTime = 0;
    // A boolean indicating whether the video kept playing since the last time the duration was updated
    this.countDuration = false;
    // A string indicating the id of the last requested video
    this.lastId = 'hMAPyGoqQVw';
    // An integer indicating the last recorded state
    this.lastState = 2;
    // An integer indicating the amount of clients which are connected
    this.connectedClients = 0;
    // Check that the room wasn't created by a bot after .5 seconds (if the amount of connected users equals zero)
    var that = this;
    setTimeout(function() {
      if (that.connectedClients === 0) {
        let index = roomIds.indexOf(that.roomId);
        roomIds.splice(index, 1);
        rooms.splice(index, 1);
      }
    }, 500);
  }
}

// An array containing all rooms
let rooms = [];
// An array containing all ids of the existing rooms
let roomIds = [];

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
  // Gets called whenever the user wants to search for a video
  .on('videoSearch', function(queryString) {
    // The full URL to call for the query
    let requestUrl = videoSearchUrl + '?part=id,snippet&q=' + encodeURI(queryString).replace(/%20/g, '+') + videoSearchParams + '&key=' + apiKey;
    // Sending the request and immediately sending the result to the user
    axios.get(requestUrl)
    .then(data => socket.emit('searchResults', data.data.items))
    .catch(err => console.log(err));
  })
  // Gets called whenever a user requests a new video
  .on('videoChange', function(id) {
    // Update the snippet of the room
    axios.get(videoInfoUrl + '?part=snippet&key=' + apiKey + '&id=' + id).then(data => roomObject.snippet = data.data.items[0].snippet);
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
    // Delete the room if no clients are connected
    if (roomObject.connectedClients === 0) {
      let index = roomIds.indexOf(roomObject.roomId);
      roomIds.splice(index, 1);
      rooms.splice(index, 1);
    }
  });
});
