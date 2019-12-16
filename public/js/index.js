const requestUrl = 'https://www.googleapis.com/youtube/v3/videos';
const apiKey = ***REMOVED***;

// Gets called when the body finished loading, loads and displays all infos of the rooms
function loadVideoInfo() {
  let url = requestUrl + '?part=snippet&key=' + apiKey + '&id=';
  let rooms = document.getElementsByClassName('roomLink');
  for (room of rooms) sendInfoRequest(url + room.name, room);
  room.removeAttribute('name');
}

sendInfoRequest = (url, room) => axios.get(url).then(data => displayVideoInfo(room, data.data));

function displayVideoInfo(room, data) {
  room.textContent = data.items[0].snippet.title;
}

// A function which creates a new room and redirects the user to it
function createRoom() {
  // Send a post request to create a new room
  axios.post('/newroom')
  // Redirect the user to the new room
  .then(data => window.location.href = data.data);
}
