// Gets called when the body has finished loading
function checkRooms() {
  // Check if there are any rooms available
  let rooms = document.getElementsByClassName('room');
  // If there are zero rooms
  if (!rooms.length) document.getElementById('roomWrapper').innerHTML = '<p class="noRoomsMessage">Currently there are no existing rooms</p>';
}

// A function which creates a new room and redirects the user to it
function createRoom() {
  // Send a post request to create a new room
  axios.post('/newroom')
  // Redirect the user to the new room
  .then(data => window.location.href = data.data);
}
