// Connect to the socket
let socket = io.connect(window.location.origin + '/watch', {query : 'ns=' + window.location.href.split('/').slice(-1)[0]});

// A boolean indicating whether the change of the state got caused by the user or an external client
let externalChange = false;

// An integer indicating the last state the player was in
let lastState = -2;

// A constant indicating how many results should be returned on a video query
const maxResults = 10;

// A function which creates a new room and redirects the user to it
function createRoom() {
  // Send a post request to create a new room
  axios.post('/newroom')
  // Redirect the user to the new room
  .then(data => window.location.href = data.data);
}

// The url called when searching for a video
const searchUrl = 'https://www.googleapis.com/youtube/v3/search';
// A string containing all params for the query url
const urlParams = '&safeSearch=none&type=video&videoEmbeddable=true';
// The api-key
const apiKey = ***REMOVED***;

// Gets called whenever the user searches for a new video
function onVideoSearch(pageToken = '') {
  // Empty the results div
  results = [];
  // The string entered by the user
  let queryString = document.getElementById('videoQuery').value;
  // The full URL to call for the query
  let requestUrl = searchUrl + '?part=id,snippet&q=' + encodeURI(queryString).replace(/%20/g, '+') + '&key=' + apiKey + '&maxResults=' + maxResults + '&pageToken=' + pageToken + urlParams;
  // Sending the request
  axios.get(requestUrl)
  .then(data => displayResults(data))
  .catch(err => console.log(err));
}

// Gets called after calculating all results
function displayResults(data) {
  let resultsDiv = document.getElementById('resultsDiv');
  // Clear results div
  while (resultsDiv.firstChild) resultsDiv.removeChild(resultsDiv.firstChild);
  // Iterating over every result to add it to the site
  for (result of data.data.items) {
    // Create the div for the new video and add it to the class video
    let resultDiv = document.createElement('DIV');
    resultDiv.classList.add('video');
    // Add an event listener to load the video, create a const so that the id doesn't get dereferenced
    const id = result.id.videoId;
    resultDiv.addEventListener('click', function() {
      // Load video and scroll back to top
      loadVideoById(id);
      window.scrollTo(0, 0);
    });
    // Creating and adding the thumbnail of the video
    let thumbnail = document.createElement('IMG');
    thumbnail.classList.add('thumbnail');
    thumbnail.src = result.snippet.thumbnails.default.url;
    resultDiv.appendChild(thumbnail);
    // Creating and adding the title for the video
    let title = document.createElement('H2');
    title.classList.add('videoTitle');
    title.innerHTML = result.snippet.title;
    resultDiv.appendChild(title);
    // Creating and adding the videos description
    let description = document.createElement('P');
    description.classList.add('description');
    description.innerHTML = result.snippet.description;
    // Append the result to the div containing all results
    resultsDiv.appendChild(resultDiv);
  }
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
  // If the time isn't zero and the player hasn't started playing yet
  if (data !== 0 && player.getPlayerState() !== 3) externalChange = true;
  player.seekTo(data, true);
})
// Gets called whenever another user requests a new video
.on('videoChange', function(id) {
  // Pause the player and load the new video
  player.loadVideoById(id);
  player.pauseVideo();
});

// Event listeners

// Gets called as soon as the player has finished loading
function startVideo() {
  // Start and stop the video
  player.playVideo();
  player.pauseVideo();
  // Sync the newly connected clients players videoId and state with the one of the other clients
  socket.emit('requestVideoSync');
  socket.emit('requestStateSync');
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
    if ((state === 3 && lastState !== -1 && lastState !== -2) || (state === 1 && lastState === 2)) socket.emit('timeChange', player.getCurrentTime());
  }
  else externalChange = false;
  if (lastState === -1 && state === 3) socket.emit('requestTimeSync');
  // Set the last state to the current state
  lastState = state;
}

// Gets called when the user submits a new video id
function loadVideoById(videoId) {
  // The current id of the video playing
  let currentId = player.getVideoUrl().split('=')[1];
  // If the id doesn't match the current id
  if (videoId !== currentId) {
    player.loadVideoById(videoId);
    externalChange = true;
    player.pauseVideo();
    socket.emit('videoChange', videoId);
  }
}
