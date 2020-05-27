// ---------- Begin of Imports ----------

var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');
var time = require('time');
var url = require('url');
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
// The url to which the request has to be sent in order to receive infos about playlists by id
const playlistInfoUrl = 'https://www.googleapis.com/youtube/v3/playlists';
// The url to which the request has to be sent in order to search for videos
const videoSearchUrl = 'https://www.googleapis.com/youtube/v3/search';
// The parameters for the query
const videoSearchParams = '&safeSearch=none&type=video,playlist&maxResults=20';
// The api-key for the project
const apiKey = ***REMOVED***;

// Routing for the homepage
app.get('/', function(req, res) {
  res.render('index.ejs', { rooms : publicRoomIds.map(roomId => rooms[roomId]) });
});

// Routing for creating a new room
app.post('/newroom', function(req, res) {
  // Create a random string to use as the rooms id
  let roomId = Math.random().toString(36).substring(2);
  // Ensure it isn't a duplicate id
  while (roomId in rooms) roomId = Math.random().toString(36).substring(2);
  // Create the new room object and push it and its id to the rooms array
  let newRoom = new Room(roomId);
  rooms[roomId] = newRoom;
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
    // A string indicating the last type of content playing
    this.lastType = 'youtube#video';
    // An integer indicating the last index of the video played of a playlist
    this.lastPlaylistIndex = 0;
    // An integer indicating the last recorded state
    this.lastState = 2;
    // An integer indicating the amount of clients which are connected
    this.connectedClients = 0;
    // A boolean indicating whether the room should be seen by others or not
    this.public = false;
    // Check that the room wasn't created by a bot after .5 seconds (if the amount of connected users equals zero)
    var that = this;
    setTimeout(function() {
      if (that.connectedClients === 0) delete rooms[that.roomId];
    }, 1000);
  }
}

// A dictionary whose key is the rooms id and its value the object of the room itself
let rooms = {};
// An array contining all rooms that should be displayed publicly and their ids
let publicRoomIds = [];

// Socket functions

// Gets called when a new clients connects to the socket
watch.on('connection', function(socket) {
  // The room to which the client is connected
  let roomId = url.parse(socket.handshake.url, true).query.ns;
  // Disconnect the user if he joins from an invalid room
  if (!(roomId in rooms)) {
    socket.disconnect();
    return;
  }
  else socket.join(roomId);
  // Get the object of the users room
  let roomObject = rooms[roomId];
  // Increment the amount of connected clients when a new client connects
  roomObject.connectedClients++;
  socket
  // Gets called by clients when they want to sync the videoId of their player to the ones of the other clients
  .on('requestVideoSync', function() {
    socket.emit('videoChange', roomObject.lastId, roomObject.lastType);
    if (roomObject.lastType === 'youtube#playlist') socket.emit('playlistIndexChange', roomObject.lastPlaylistIndex);
  })
  // Sends the visibility of the room to the client
  .on('requestVisibilitySync', function() {
    socket.emit('visibilityChange', roomObject.public);
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
    socket.broadcast.to(roomId).emit('stateChange', state);
    roomObject.lastState = state;
    // If the new state is playing
    if (state === 1) {
      roomObject.countDuration = true;
      roomObject.lastDuration = duration;
      roomObject.lastDurationTime = time.time();
      if (duration !== roomObject.lastDuration) socket.broadcast.to(roomId).emit('timeChange', duration);
    }
    // If the new state is paused
    else if (state === 2) roomObject.countDuration = false;
  })
  // Gets called whenever a client changes the time of their video
  .on('timeChange', function(data) {
    socket.broadcast.to(roomId).emit('timeChange', data);
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
  .on('videoChange', function(id, type) {
    // Update the snippet of the room
    axios.get(type === 'youtube#video' ? videoInfoUrl : playlistInfoUrl + '?part=snippet&key=' + apiKey + '&id=' + id).then(data => roomObject.snippet = data.data.items[0].snippet);
    // Refresh the last id
    roomObject.lastId = id;
    // Refresh the last content type
    roomObject.lastType = type;
    if (type === 'youtube#playlist') roomObject.lastPlaylistIndex = 0
    // Reset lastDuration and countDuration
    roomObject.lastDuration = 0; roomObject.countDuration = true; roomObject.lastDurationTime = time.time();
    // Send the video id to all other users
    socket.broadcast.to(roomId).emit('videoChange', id, type);
  })
  // Gets called whenever a user changes the index of the currently playing playlist video
  .on('playlistIndexChange', function(index) {
    roomObject.lastPlaylistIndex = index;
    socket.broadcast.to(roomId).emit('playlistIndexChange', index);
  })
  // Gets called whenever the user changed the visibility of the room
  .on('changeVisibility', function(public) {
    // Don't do anything if the state itself didn't change
    if (public !== roomObject.public) {
      roomObject.public = public;
      if (public) {
        // Add room id to public rooms array
        publicRoomIds.push(roomId);
      } else {
        // Remove the room id from the public rooms array
        let publicIndex = publicRoomIds.indexOf(roomId);
        publicRoomIds.splice(publicIndex, 1);
      }
      // Synchronise visibility between users
      socket.broadcast.to(roomId).emit('visibilityChange', public);
    }
  })
  // Gets called whenever a user sends a message
  .on('newMessage', function(username, message) {
    socket.broadcast.to(roomId).emit('newMessage', username, message);
  })
  // Decrement the amount of connected clients when one disconnects
  .on('disconnect', function() {
    roomObject.connectedClients--;
    // Delete the room if no clients are connected
    if (roomObject.connectedClients === 0) {
      delete rooms[roomId];
      // Remove the room from the public rooms list if its visibility was public
      if (roomObject.public) {
        let publicIndex = publicRoomIds.indexOf(roomId);
        publicRoomIds.splice(publicIndex, 1);
      }
    }
  });
});
