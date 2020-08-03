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
  $.cookie('firstTime', '1');
}

// Gets called when the body has finished loading
function checkRooms() {
  // Check if there are any rooms available
  let rooms = document.getElementsByClassName('room');
  // If there are zero rooms
  if (!rooms.length) $('#noRooms').removeClass('d-none');
}

// A function which creates a new room and redirects the user to it
function createRoom() {
  // Send a post request to create a new room
  axios.post('/newroom')
  // Redirect the user to the new room
  .then(data => window.location.href = data.data);
}
