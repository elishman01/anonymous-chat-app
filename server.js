const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? process.env.FRONTEND_URL 
            : 'http://localhost:3000',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add route for room URLs
app.get('/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection
io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle room joining
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
        // Notify only this user that they've joined successfully
        socket.emit('message', {
            userId: 'System',
            message: `You've joined the room ${roomId}`
        });
    });

    socket.on('message', (msg) => {
        // Get the rooms this socket is in
        const rooms = Array.from(socket.rooms);
        // The first room is always the socket's ID, so we want the second one
        const roomId = rooms[1];
        
        if (roomId) {
            // Broadcast to the specific room
            io.to(roomId).emit('message', msg);
        } else {
            // Fallback: broadcast to everyone (should not happen)
            io.emit('message', msg);
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
