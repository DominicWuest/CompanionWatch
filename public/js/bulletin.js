let socket = io.connect('http://localhost:3000/bulletin');

function sendMessage() {
  socket.emit('message', name, document.getElementById('message').value);
}
