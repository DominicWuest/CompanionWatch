// Connect to the socket
let socket = io.connect('http://localhost:3000/watch');

// A boolean indicating whether the change of the state got caused by the user or an external client
let externalChange = false;

// An integer indicating the last state the player had
let lastState = -1;

// Socket message listeners

socket
// Gets called whenever the state of the player of any client changes
.on('stateChange', function(data) {
  externalChange = true;
  // Resume the video if the new state is 1 or pause the video if the new state is 2
  switch (data) {
    case 1: player.playVideo(); break;
    case 2: player.pauseVideo(); break;
  }
})
// Gets called whenever another user changes the time of the video or the user requests to sync the time
.on('timeChange', function(data) {
  player.seekTo(data, true);
  if (data !== 0) player.playVideo();
});

// Event listeners

// Gets called as soon as the page is loaded
function startVideo() {
  // Start and stop the video
  player.playVideo();
  player.pauseVideo();
  // Sync the newly connected clients players time with the one of the other clients
  requestTimeSync();
  // Add the event listener for stateChange
  player.addEventListener('onStateChange', 'synchPlayerStates');
}

// Gets called whenever the player state changes
function synchPlayerStates(data) {
  let state = data.data;
  // Only emit events if the change doesn't come from an emitted event itself
  if (externalChange) externalChange = false;
  // Synch the states of the clients players if the user stopped or resumed the video
  else if (state === 1 || state === 2) socket.emit('stateChange', data.data);
  // Synch the time of the clients players if the a users video starts buffering
  else if (state === 3 && lastState !== -1) socket.emit('timeChange', player.getCurrentTime());
  // Set the last state to the current state
  lastState = state;
}

// Gets called whenever the page finishes loading in order to sync the time with the one from the other users
function requestTimeSync() {
  socket.emit('requestTimeSync');
}
