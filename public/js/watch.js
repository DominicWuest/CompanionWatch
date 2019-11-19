let socket = io.connect('http://localhost:3000/watch');

let externalChange = false;

let lastState = -1;

// Socket message listeners

// Gets called whenever the state of the player of any client changes
socket.on('stateChange', function(data) {
  if (data[0] === player.getPlayerState()) return;
  externalChange = true;
  switch (data[0]) {
    case 1: player.playVideo(); break;
    case 2: player.pauseVideo(); break;
  }
  player.seekTo(data[1], true);
});

// Event listeners

// Gets called as soon as the page is loaded
function startVideo() {
  // Start and stop the video
  player.playVideo();
  player.stopVideo();
  // Add the event listener for stateChange
  player.addEventListener('onStateChange', 'synchPlayerStates');
}

// Gets called whenever the playerState changes
function synchPlayerStates(data) {
  // TODO: Sync after buffering
  if (lastState !== 3) socket.emit('stateChange', [data.data, player.getCurrentTime()]);
  if (externalChange) externalChange = false;
  else lastState = data.data;
}
