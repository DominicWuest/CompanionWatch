if (!$.cookie('username')) {
  bootbox.prompt({
    title: 'What do they call ye, master?',
    buttons: {
      confirm: {
        label: "'Tis my name",
        className: 'btn-success'
      },
      cancel: {
        className: 'd-none'
      }
    },
    centerVertical: true,
    closeButton: false,
    onEscape: false,
    callback: function(result) {
      if (result === null || result.length === 0) return false;
      $.cookie('username', result, { path : '/' });
    }
  });
}

// Tell the user to turn on autoplay if they are visiting for the first time
if (!$.cookie('firstTime')) {
  bootbox.alert({
    title: 'Autoplay',
    message: 'Remember to turn on Autoplay for this website in order for it to work properly!',
    buttons: {
      ok: {
        label: 'Duh'
      }
    }
  });
  $.cookie('firstTime', '1', { path : '/' });
}

// Connect to the socket
let socket = io.connect(window.location.origin + '/watch', {query : 'ns=' + window.location.href.split('/').slice(-1)[0]});

// An indicating whether the change of the state got caused by the user or an external client, positive means external change, negative means internal change
let externalChange = 0;

// An integer indicating the last state the player was in
let lastState = -2;

// The video id of the last played video, mainly used to catch video changes when playing playlists
let lastVideoId = '';

// The last type of content played (youtube#video or youtube#playlist)
let lastType = '';

// A float indicating the last
let lastTime = 0;

// A function which creates a new room and redirects the user to it
function createRoom() {
  // Send a post request to create a new room
  axios.post('/newroom')
  // Redirect the user to the new room
  .then(data => window.location.href = data.data);
}

// Gets called whenever the user searches for a new video
function onVideoSearch() {
  // Empty the results div
  results = [];
  // The string entered by the user
  let queryString = $('#videoQuery').val();
  // Send the search request over the socket to the server so as to not expose the apiKey
  socket.emit('videoSearch', queryString);
}

// Gets called after calculating all results
function displayResults(data) {
  // Get the div where the results will be displayed
  let resultsDiv = $('#resultsDiv');
  // Clear results div
  resultsDiv.innerHTML = '';
  // The template for creating new video results
  let divTemplate = document.getElementById('videoTemplate').content.querySelector('div');
  // Iterating over every result to add it to the site
  for (result of data) {
    // Create the div for the new video and add it to the class video
    let resultDiv = document.importNode(divTemplate, true);
    // Attach the correct event listener
    let type = result.id.kind;
    if (type  === 'youtube#video') {
      const videoId = result.id.videoId;
      resultDiv.addEventListener('click', function() {
        loadVideoById(videoId);
        externalChange = 3;
        socket.emit('videoChange', videoId, 'youtube#video');
      });
    } else if (type === 'youtube#playlist') {
      const playlistId = result.id.playlistId;
      resultDiv.addEventListener('click', function() {
        loadPlaylistById(playlistId);
        externalChange = 3;
        socket.emit('videoChange', playlistId, 'youtube#playlist');
      });
    }
    // Adding the information of the video
    resultDiv.querySelector('img').src = result.snippet.thumbnails.default.url;
    resultDiv.querySelector('h2').innerHTML = result.snippet.title;
    resultDiv.querySelector('p').textContent = result.snippet.channelTitle;
    // Append the result to the div containing all results
    resultsDiv.append(resultDiv);
  }
  adjustTabsMenuHeight();
  // Focus the tab where results are displayed
  $('#resultsDivTab').click();
}

// Displays all items of a newly playing playlist under playlist controls
function displayPlaylistItems(items) {
  // Get the div where the results will be displayed
  let itemsDiv = $('#playlistItems');
  // Clear results div
  itemsDiv.innerHTML = '';
  // The template for creating new video results
  let divTemplate = document.getElementById('videoTemplate').content.querySelector('div');
  // Iterating over every result to add it to the site
  for (let i = 0; i < items.length; i++) {
    let item = items[i];
    // Create the div for the new video and add it to the class video
    let itemDiv = document.importNode(divTemplate, true);
    // Attach the correct event listener
    const index = i;
    itemDiv.addEventListener('click', function() {
      if (index !== player.getPlaylistIndex()) {
        externalChange = 3;
        player.playVideoAt(index);
        socket.emit('playlistIndexChange', index);
      }
    });
    // Adding the information of the video
    itemDiv.querySelector('img').src = item.snippet.thumbnails.default.url;
    itemDiv.querySelector('h2').innerHTML = item.snippet.title;
    itemDiv.querySelector('p').textContent = item.snippet.channelTitle;
    // Append the result to the div containing all results
    itemsDiv.append(itemDiv);
  }
  adjustTabsMenuHeight();
}

// Gets called when the user submits a new video id
function loadVideoById(videoId) {
  // Clear playlist items div
  $('#playlistItems').innerHTML = '';
  // If the id doesn't match the current id
  if (videoId !== lastVideoId) {
    // Update the last type
    lastType = 'youtube#video';
    // Update the last id
    let lastId = player.getVideoUrl().split('=')[1];
    // Disable the playlist controls tab
    $('#playlistTab').addClass('disabled');
    // Load the video
    player.loadVideoById(videoId);

  }
}

function loadPlaylistById(playlistId) {
  // Get the id of the currently playing playlist
  let currentId;
  // If a video has been loaded
  if (player.getVideoUrl().includes('=')) currentId = player.getVideoUrl().split('=')[1].slice(0, -2);
  else currentId = '';
  if (playlistId !== currentId) {
    // Update the last type
    lastType = 'youtube#playlist';
    // Enable the playlist controls tab
    $('#playlistTab').removeClass('disabled');
    // Load the playlist
    player.loadPlaylist({list : playlistId});
  }
}

// Gets called when the user wants to send a message
function sendMessage() {
  // Get the message
  let message = $('#messageInput').val();
  // Reset the textfield
  $('#messageInput').val('');
  // If the message is empty, don't send anything
  if (message === '') return;
  // Get the username
  let username = $.cookie('username');
  // Send the message to all other users
  socket.emit('newMessage', username, message);
  // Add the message to the users chat tab
  addMessage(true, username, message);
}

// Adds the message to the chat tab
function addMessage(ownMessage, username, message) {
  let messagesDiv = $('#messages');
  // Check if user is at bottom of chat
  let scrollToBottom = false;
  if (Math.ceil(messagesDiv.scrollTop() + messagesDiv.innerHeight()) === messagesDiv[0].scrollHeight) scrollToBottom = true;
  // Get the correct template
  if (ownMessage) var template = document.getElementById('ownMessageTemplate');
  else var template = document.getElementById('foreignMessageTemplate')
  // Get the template
  let messageTemplate = template.content.querySelector('.messageWrapper');
  let messageDiv = document.importNode(messageTemplate, true);
  // Set the text for the message, username and timestamp
  messageDiv.querySelector('.speech-bubble').textContent = message;
  messageDiv.querySelector('.messageName').textContent = username;
  let date = new Date();
  messageDiv.querySelector('.timestamp').textContent = date.toTimeString().split(' ')[0].slice(0, 5);
  // Append the new message
  messagesDiv.append(messageDiv);
  // Scroll to bottom if needed
  if (scrollToBottom) messagesDiv.scrollTop(messagesDiv[0].scrollHeight);
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
  if (data !== 0 && player.getPlayerState() !== 3) externalChange = 2;
  // If the video has finished
  if (data >= player.getDuration()) {
    player.seekTo(0, false);
    player.pauseVideo();
  } else player.seekTo(data, true);
})
// Gets called whenever another user requests a new video
.on('videoChange', function(id, type) {
  // Correctly load the new content
  if (type === 'youtube#video') loadVideoById(id);
  else if (type === 'youtube#playlist') loadPlaylistById(id);
})
// Gets called whenever another user changes the index of the currently playing playlist video
.on('playlistIndexChange', function(index) {
  externalChange = 3;
  player.playVideoAt(index);
})
// Synchronises shwon visibility for clients
.on('visibilityChange', function(data) {
  $('#visibilityToggle').prop('checked', data).change();
})
// Gets called after the user sent a search request, displays the results
.on('searchResults', (data) => displayResults(data))
// Gets called whenever a user changes the video to a playlist, displays the playlist items under playlist controls
.on('playlistItems', (items) => displayPlaylistItems(items))
// Gets called whenever another user sends a message
.on('newMessage', (username, message) => addMessage(false, username, message));

// Event listeners

// Gets called as soon as the player has finished loading
function startVideo() {
  // Sync the newly connected clients players videoId, visibility and state with the one of the other clients
  socket.emit('requestVideoSync');
  socket.emit('requestVisibilitySync');
  socket.emit('requestStateSync');
  // Send a request to sync times after the player has finished loading
  let timeSyncInterval = setInterval(function() {
    if (player.getDuration()) {
      clearInterval(timeSyncInterval);
      socket.emit('requestTimeSync');
      if (player.getPlayerState() === 3) socket.emit('stateChange', 1);
      // Add the event listener for stateChange
      player.addEventListener('onStateChange', 'synchPlayerStates');
    }
  }, 50);
}

// Gets called whenever the player state changes
function synchPlayerStates(data) {
  let state = data.data;
  // Only emit events if the change doesn't come from an emitted event itself
  if (externalChange < 1) {
    if (state === 2) lastTime = player.getCurrentTime();
    else if (state === 1 && lastTime !== player.getCurrentTime()) socket.emit('timeChange', player.getCurrentTime());
    // Synch the states of the clients players if the user stopped or resumed the video
    if (state === 1 || state === 2) socket.emit('stateChange', state, player.getCurrentTime());
    // Synch the time of the clients players if the users video starts buffering or if the user started playing the video again
    if (state === 3 && lastState !== -1 && lastState !== -2) socket.emit('timeChange', player.getCurrentTime());
    // Catch changes of playlist video
    if (lastType === 'youtube#playlist' && state === -1) socket.emit('playlistIndexChange', player.getPlaylistIndex());
  }
  // Decrement the externalchange variable
  externalChange--;
  // Set the last state to the current state
  lastState = state;
}

// Gets called when the value of the visibility checkbox changes. Sends new visibility status of room
function changeVisibility(data) {
  socket.emit('changeVisibility', data);
}

// Resizes tabs menu in order to display the scrollbar correctly
function adjustTabsMenuHeight() {
  let div = $('.tab-content');
  div.css('height', window.innerHeight - div.position().top - parseInt(div.css('margin-top')));
}
