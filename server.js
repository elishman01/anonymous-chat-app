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

// Store active rooms and their timeouts
const activeRooms = new Map();
const ROOM_EXPIRY_TIME = 2 * 60 * 1000; // 2 minutes in milliseconds for testing

// Function to remove room and notify users
function removeRoom(roomId) {
    const room = activeRooms.get(roomId);
    if (room) {
        // Notify users in the room
        io.to(roomId).emit('message', {
            userId: 'System',
            message: 'This room has expired. Please create a new room.'
        });
        
        // Disconnect all users from the room
        io.in(roomId).disconnectSockets();
        
        // Clear the timeout and delete the room
        clearTimeout(room.timeout);
        activeRooms.delete(roomId);
        
        console.log(`Room ${roomId} has expired and been removed`);
    }
}

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
    const roomId = req.params.roomId;
    
    // Check if room exists and hasn't expired
    if (activeRooms.has(roomId)) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // Redirect to home if room doesn't exist or has expired
        res.redirect('/');
    }
});

// WebSocket connection
io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle room joining
    socket.on('join-room', (roomId) => {
        // Check if room exists or create it
        if (!activeRooms.has(roomId)) {
            // Set up room expiration
            const timeout = setTimeout(() => removeRoom(roomId), ROOM_EXPIRY_TIME);
            activeRooms.set(roomId, {
                createdAt: Date.now(),
                timeout: timeout
            });
            console.log(`Created new room: ${roomId}`);
        }

        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);

        // Send room expiry time to user
        const room = activeRooms.get(roomId);
        const expiresIn = (room.createdAt + ROOM_EXPIRY_TIME - Date.now()) / 1000;
        
        socket.emit('room-info', {
            roomId: roomId,
            expiresIn: expiresIn,
            message: `Room will expire in ${Math.floor(expiresIn / 60)} minutes`
        });
    });

    socket.on('message', (msg) => {
        // Get the rooms this socket is in
        const rooms = Array.from(socket.rooms);
        // The first room is always the socket's ID, so we want the second one
        const roomId = rooms[1];
        
        if (roomId && activeRooms.has(roomId)) {
            // Broadcast to the specific room
            io.to(roomId).emit('message', msg);
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
