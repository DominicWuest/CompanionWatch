// Connect to the socket
let socket = io.connect(window.location.href);

// A boolean indicating whether the change of the state got caused by the user or an external client
let externalChange = false;

// An integer indicating the last state the player had
let lastState = -1;

// An integer indicating how many result-videos have been displayed from a query
let resultCount = 0;

// A constant indicating the amount of times the video search will be executed
const maxResults = 0;

// The url called when searching for a video
const searchUrl = 'https://www.googleapis.com/youtube/v3/search';
// The api-key
const apiKey = ***REMOVED***;

// Gets called whenever the user searches for a new video
function onVideoSearch(pageToken = '') {
  // The string entered by the user
  let queryString = document.getElementById('videoQuery').value;
  // The full URL to call for the query
  let requestUrl = searchUrl + '?part=id,snippet&q=' + encodeURI(queryString).replace(/%20/g, '+') + '&key=' + apiKey + '&pageToken=' + pageToken;
  // Sending the request
  axios.get(requestUrl)
  .then(data=>displayResults(data))
  .catch(err=>console.log(err));
}

// Gets called when the results of the query have arrived
function displayResults(data) {
  // Clear results div if it is a new query
  //if (resultCount === 0) void(0);
  // Get next results if max results hasn't been reached yet
  if (resultCount++ < maxResults) onVideoSearch(data.data.nextPageToken);
  // Reset resultCount if the max results have been reached
  else {
    resultCount = 0;
    requestVideo(data.data.items[0].id.videoId)
  }
  console.log(data);
}

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
})
// Gets called whenever another user requests a new video
.on('videoChange', function(id) {
  // Don't change the video if the id is empty
  if (id === '') return;
  // Set external change to true as otherwise a state change event would be emitted
  externalChange = true;
  // Pause the player and load the new video
  player.loadVideoById(id);
  player.pauseVideo();
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
    if ((state === 3 && lastState !== -1) || (state === 1 && lastState === 2)) socket.emit('timeChange', player.getCurrentTime());
  }
  else externalChange = false;
  // Set the last state to the current state
  lastState = state;
}

// Gets called when the user submits a new video id
function requestVideo(videoId) {
  // The current id of the video playing
  let currentId = player.getVideoUrl().split('=')[1];
  // If the id doesn't match the current id and it is a valid id
  if (videoId !== currentId) {
    player.loadVideoById(videoId);
    externalChange = true;
    player.pauseVideo();
    socket.emit('videoChange', videoId);
  }
}
