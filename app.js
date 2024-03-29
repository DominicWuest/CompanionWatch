// ---------- Begin of Imports ----------

var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');
var time = require('time');
var url = require('url');
var axios = require('axios');
var winston = require('winston');
var fs = require('fs');
var watchjs = require('watchjs');
var dotenv = require('dotenv');

// ----------- End of Imports -----------

dotenv.config();

// Start server
let port = process.env.PORT || 3000;
server.listen(port, function (err) {
	if (err)
		console.log("Failed to start server: ", err);
	else
		console.log("Listening on port ", port);
});

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
// The url to which the request has to be sent in order to receive infos about playlists by id
const playlistItemsUrl = 'https://www.googleapis.com/youtube/v3/playlistItems';
// The url to which the request has to be sent in order to search for videos
const videoSearchUrl = 'https://www.googleapis.com/youtube/v3/search';
// The parameters for the query
const videoSearchParams = '&safeSearch=none&type=video,playlist&maxResults=20';
// The api-key for the project
const apiKey = process.env.API_KEY;

// The videoID of the video which plays when creating a new room
const defaultVideoId = 'hMAPyGoqQVw';
// Getting the snippet for the default video
var defaultSnippet;
axios.get(videoInfoUrl + '?part=snippet&key=' + apiKey + '&id=' + defaultVideoId).then(data =>
defaultSnippet = data.data.items[0].snippet);

// Setting up the logger
const logger = winston.createLogger({
  levels : winston.config.syslog.levels,
  format: winston.format.combine(
    winston.format.splat(),
    winston.format.simple()
  ),
  transports : [
    new winston.transports.File({
      filename: 'companionWatch.log',
      level: 'info'
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'warnings.log',
      level: 'warn'
    })
  ]
});

// Create date object for logging timestamps of events
var date = new Date();

// Routing for the homepage
app.get('/', function(req, res) {
  logger.info('[%d:%d] GET-Request to / by %s', date.getHours(), date.getMinutes(), req.ip);
  res.render('index.ejs', { rooms : getPublicRooms() });
});

// Routing for creating a new room
app.post('/newroom', function(req, res) {
  logger.info('[%d:%d] POST-Request to /newroom by %s', date.getHours(), date.getMinutes(), req.ip);
  // Create a random string to use as the rooms id
  let roomId = Math.random().toString(36).substring(2);
  // Ensure it isn't a duplicate id
  while (roomId in rooms) roomId = Math.random().toString(36).substring(2);
  // Create the new room object and push it and its id to the rooms array
  let newRoom = new Room(roomId, false);
  rooms[roomId] = newRoom;
  logger.info('[%d:%d] New Room with ID %s created', date.getHours(), date.getMinutes(), roomId);
  res.send('/watch/' + roomId);
});

// Sends all public rooms
app.get('/rooms', function(req, res) {
  res.json(getPublicRooms());
});

// Routing for the page where clients can watch videos together
app.get(new RegExp('/watch/(.+)'), function(req, res) {
  logger.info('[%d:%d] GET-Request to %s by %s', date.getHours(), date.getMinutes(), req.path, req.ip);
  res.render('roomWatch.ejs', {});
});

// Namespace for /watch
var watch = io.of('/watch');

// Class for rooms
class Room {
  constructor(roomId, allowEmpty) {
    // The id of the room
    this.roomId = roomId;
    // An integer indicating the time of the video which has passed when the last timeChange was recorded
    this.lastDuration = 0;
    // An integer indicating the time when the last timeChange was recorded
    this.lastDurationTime = 0;
    // A boolean indicating whether the video kept playing since the last time the duration was updated
    this.countDuration = false;
    // A string indicating the id of the last requested video
    this.lastId = defaultVideoId;
    // A string indicating the last type of content playing
    this.lastType = 'youtube#video';
    // The snippet of the currently playing media
    this.snippet = defaultSnippet;
    // An array containing all items of the last displayed playlist. Will only be available to user when the playlist is playing
    this.playlistItems;
    // An integer indicating the last index of the video played of a playlist
    this.lastPlaylistIndex = 0;
    // An integer indicating the last recorded state
    this.lastState = 2;
    // An integer indicating the amount of clients which are connected
    this.connectedClients = 0;
    // A boolean indicating whether the room should be seen by others or not
    this.public = false;
    // If the room is allowed to be empty
    this.allowEmpty = allowEmpty;
    if (!this.allowEmpty) {
      // Check that the room wasn't created by a bot after .5 seconds (if the amount of connected users equals zero)
      var that = this;
      setTimeout(function() {
        if (that.connectedClients === 0) delete rooms[that.roomId];
      }, 1000);
    }
  }
}

// A dictionary whose key is the rooms id and its value the object of the room itself
let rooms = {};
// An array contining all rooms that should be displayed publicly and their ids
let publicRoomIds = [];

// Initialises the dev-room
initialiseDevRoom();

// ------------ Start of Socket Listeners ------------

// Gets called when a new clients connects to the socket
watch.on('connection', function(socket) {
  let queryString = url.parse(socket.handshake.url, true);
  // The room to which the client is connected
  let roomId = queryString.query.ns;
  logger.info('[%d:%d] %s connected to room with room ID %s (IP : %s)', date.getHours(), date.getMinutes(), socket.id, roomId, socket.conn.remoteAddress.split(":")[3]);
  // Disconnect the user if he joins from an invalid room
  if (!(roomId in rooms)) {
    socket.disconnect();
    return;
  }
  else socket.join(roomId);
  // Get the object of the users room
  let roomObject = rooms[roomId];
  // Add the username to the properties of the connected socket
  socket.username = queryString.query.un;
  // Send all users the message that a new user joined
  socket.to(roomId).emit('userJoined', socket.username);
  // Increment the amount of connected clients when a new client connects
  roomObject.connectedClients++;
  socket
  // Gets called by clients when they want to sync the videoId of their player to the ones of the other clients
  .on('requestVideoSync', function() {
    socket.emit('videoChange', roomObject.lastId, roomObject.lastType, roomObject.lastPlaylistIndex);
    if (roomObject.lastType === 'youtube#playlist') socket.emit('playlistItems', roomObject.playlistItems);
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
    else if (state === 2) {
      roomObject.lastDuration = duration;
      roomObject.countDuration = false;
    }
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
    logger.info('[%d:%d] %s sent search query "%s" from room with room ID %s (IP : %s)', date.getHours(), date.getMinutes(), socket.id, queryString, roomId, socket.conn.remoteAddress.split(":")[3]);
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
    axios.get((type === 'youtube#video' ? videoInfoUrl : playlistInfoUrl) + '?part=snippet&key=' + apiKey + '&id=' + id).then(data => roomObject.snippet = data.data.items[0].snippet);
    // Refresh the last id
    roomObject.lastId = id;
    // Refresh the last content type
    roomObject.lastType = type;
    if (type === 'youtube#playlist') {
      // Get all videos from the playlist
      axios.get(playlistItemsUrl + '?part=snippet&maxResults=50&key=' + apiKey + '&playlistId=' + id).then(function(data) { roomObject.playlistItems = data.data.items; watch.to(roomId).emit('playlistItems', data.data.items); });
      roomObject.lastPlaylistIndex = 0;
    }
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
      // Add room id to public rooms array if new visibility is public
      if (public) publicRoomIds.push(roomId);
      // Remove the room id from the public rooms array if new visibility is private
      else {
        let publicIndex = publicRoomIds.indexOf(roomId);
        publicRoomIds.splice(publicIndex, 1);
      }
      // Synchronise visibility between users
      socket.broadcast.to(roomId).emit('visibilityChange', public);
    }
  })
  // Gets called whenever a user sends a message
  .on('newMessage', function(username, message) {
    logger.info('[%d:%d] %s sent message "%s" with username "%s" to room with room ID %s (IP : %s)', date.getHours(), date.getMinutes(), socket.id, message, username, roomId, socket.conn.remoteAddress.split(":")[3]);
    socket.broadcast.to(roomId).emit('newMessage', username, message);
  })
  // Decrement the amount of connected clients when one disconnects
  .on('disconnect', function() {
    // Log the event of the user disconnecting
    logger.info('[%d:%d] %s left room with room ID %s (IP : %s)', date.getHours(), date.getMinutes(), socket.id, roomId, socket.conn.remoteAddress.split(":")[3]);
    // Decrement the counter of connected clients
    roomObject.connectedClients--;
    // Send the message that the client left to all other connected clients
    socket.to(roomId).emit('userDisconnected', socket.username);
    // Delete the room if no clients are connected and the room isn't allowed to be empty
    if (roomObject.connectedClients === 0 && !roomObject.allowEmpty) {
      delete rooms[roomId];
      // Remove the room from the public rooms list if its visibility was public
      if (roomObject.public) {
        let publicIndex = publicRoomIds.indexOf(roomId);
        publicRoomIds.splice(publicIndex, 1);
      }
    }
  });
});

// ------------- End of Socket Listeners -------------

// Returns an array of the object of all public rooms
getPublicRooms = () => publicRoomIds.map(function(roomId) {
  // Return an object with the important attributes of the room
  let room = rooms[roomId];
  return {
    "roomId" : room.roomId,
    "connectedClients" : room.connectedClients,
    "snippet" : {
      "title" : room.snippet.title,
      "thumbnails" : room.snippet.thumbnails
    }
  };
});

// Creates a new room and returns it
function createRoom(allowEmpty) {
  // Create a random string to use as the rooms id
  let roomId = Math.random().toString(36).substring(2);
  // Ensure it isn't a duplicate id
  while (roomId in rooms) roomId = Math.random().toString(36).substring(2);
  // Create the new room object and push it and its id to the rooms array
  let newRoom = new Room(roomId, true);
  return newRoom;
}

// Attaches a watcher to a room and calls callbackFn whenever the variable changes
function attachRoomWatcher(roomId, callbackFn) {
  watchjs.watch(rooms[roomId], () => callbackFn());
}

// Writes the roomObject of the dev-room to dev-room.json
function saveDevRoom(roomId) {
  fs.writeFile('dev-room.json', JSON.stringify(rooms[roomId]), (err) => {});
}

// Gets the attributes of the dev room from dev-room.json and intiates it
function initialiseDevRoom() {
  // Check if dev-room.json exists
  fs.stat('dev-room.json', function(err, stat) {
    // File exists --> read from it
    if (err == null) {
      fs.readFile('dev-room.json', (err, data) => {
          if (err) throw err;
          let devRoom = JSON.parse(data);
          // Reset some values of the room
          devRoom.connectedClients = 0; devRoom.lastState = 2; devRoom.countDuration = false;
          rooms[devRoom.roomId] = devRoom;
          attachRoomWatcher(devRoom.roomId, () => saveDevRoom(devRoom.roomId));
          logger.info('[%d:%d] Reinitiated dev-room with id %s', date.getHours(), date.getMinutes(), devRoom.roomId);
      });
    }
    // File doesn't exist --> create dev-room
    else if (err.code === 'ENOENT') {
      let devRoom = createRoom(true);
      rooms[devRoom.roomId] = devRoom;
      attachRoomWatcher(devRoom.roomId, () => saveDevRoom(devRoom.roomId));
      logger.info('[%d:%d] Created dev-room with id %s', date.getHours(), date.getMinutes(), devRoom.roomId);
    }
    // Some other error
    else logger.error('[%d:%d] Error reading dev-room.json: %s', date.getHours(), date.getMinutes(), err.code);
  });
}
