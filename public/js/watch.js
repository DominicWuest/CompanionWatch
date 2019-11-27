// Connect to the socket
let socket = io.connect(window.location.href);

// A boolean indicating whether the change of the state got caused by the user or an external client
let externalChange = false;

// An integer indicating the last state the player had
let lastState = -1;

// Socket message listeners

socket
// Gets called whenever the state of the player of any client changes
.on('stateChange', function(data) {
  if (data === player.getPlayerState()) return;
  // Resume the video if the new state is 1 or pause the video if the new state is 2
  switch (data) {
    case 1: player.playVideo(); break;
    case 2: player.pauseVideo(); break;
  }
  if ([1, 2].includes(data)) externalChange = true;
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
  // Sync the newly connected clients players time and state with the one of the other clients
  socket.emit('requestSync');
  // Add the event listener for stateChange
  player.addEventListener('onStateChange', 'synchPlayerStates');
}

// Gets called whenever the player state changes
function synchPlayerStates(data) {
  let state = data.data;
  // Only emit events if the change doesn't come from an emitted event itself
  if (!externalChange) {
    // Synch the states of the clients players if the user stopped or resumed the video
    if (state === 1 || state === 2) socket.emit('stateChange', state, player.getCurrentTime());
    // Synch the time of the clients players if the users video starts buffering or if the user started playing the video again
    else if ((state === 3 && lastState !== -1) || (state === 2 && lastState === 1)) socket.emit('timeChange', player.getCurrentTime());
  }
  else externalChange = false;
  // Set the last state to the current state
  lastState = state;
}
