// /full/path/to/your/project/running-event-timer/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Konfigurasi session
const sessionMiddleware = session({
    secret: 'sangatRahasiaSekali', // Ganti dengan secret yang lebih aman di produksi
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set true jika menggunakan HTTPS
});

app.use(sessionMiddleware);
io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

app.use(express.static('public'));
app.use(express.json()); // Untuk parsing body JSON dari request

// Data pengguna (untuk contoh, idealnya disimpan di database)
const users = {
    admin: { password: 'adminpassword', role: 'ADMIN' },
    tk10k: { password: 'tkpassword', role: 'TIME_KEEPER_10K' },
    tk5k: { password: 'tkpassword', role: 'TIME_KEEPER_5K' },
    // Tambahkan lebih banyak time keeper jika perlu
};

// State Aplikasi
let timers = {
    '10K': { running: false, elapsedTime: 0, lastStartTime: 0, intervalId: null },
    '5K': { running: false, elapsedTime: 0, lastStartTime: 0, intervalId: null }
};

let splitTimes = {
    '10K_MALE': [],   // { id: timestamp, time: 'HH:MM:SS.mmm', bib: '' }
    '10K_FEMALE': [], // { id: timestamp, time: 'HH:MM:SS.mmm', bib: '' }
    '5K_MALE': [],    // { id: timestamp, time: 'HH:MM:SS.mmm', bib: '' }
    '5K_FEMALE': []   // { id: timestamp, time: 'HH:MM:SS.mmm', bib: '' }
};

function formatTimeMs(ms) {
    const milliseconds = String(ms % 1000).padStart(3, '0');
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function broadcastTimers() {
    Object.keys(timers).forEach(raceCategory => {
        let currentElapsedTime = timers[raceCategory].elapsedTime;
        if (timers[raceCategory].running) {
            currentElapsedTime += Date.now() - timers[raceCategory].lastStartTime;
        }
        io.emit('time_update', { raceCategory, time: currentElapsedTime });
    });
}

function broadcastSplits() {
    io.emit('splits_update', splitTimes);
}

function startTimerInterval(raceCategory) {
    if (timers[raceCategory].intervalId) clearInterval(timers[raceCategory].intervalId);
    timers[raceCategory].intervalId = setInterval(() => {
        if (timers[raceCategory].running) {
            broadcastTimers(); // Cukup broadcast semua timer secara periodik
        }
    }, 100); // Update setiap 100ms
}

// Endpoint Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (user && user.password === password) {
        req.session.user = { username, role: user.role };
        res.json({ success: true, role: user.role, username });
    } else {
        res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});


io.on('connection', (socket) => {
    console.log('Klien terhubung:', socket.id);
    // const session = socket.request.session; // Original line

    // MODIFICATION: Extract user info and attach a simplified version to the socket
    // This helps prevent issues if the full session object is complex or has circular refs
    let userFromSession = null;
    if (socket.request.session && socket.request.session.user) {
        // Create a plain object copy of essential user data
        userFromSession = {
            username: socket.request.session.user.username,
            role: socket.request.session.user.role
            // Copy only necessary, serializable properties
        };
    }
    socket.user = userFromSession; // Attach the simplified user object to the socket instance


    // Kirim state awal ke klien yang baru terhubung
    // MODIFICATION: Send a sanitized version of timers, excluding intervalId
    const sanitizedTimers = {};
    for (const key in timers) {
        sanitizedTimers[key] = {
            running: timers[key].running,
            elapsedTime: timers[key].elapsedTime,
            lastStartTime: timers[key].lastStartTime
            // intervalId is deliberately excluded
        };
    }
    socket.emit('initial_state', { timers: sanitizedTimers, splitTimes });    broadcastTimers(); // Pastikan timer dikirim saat koneksi baru

    // Handler untuk Admin
    if (socket.user && socket.user.role === 'ADMIN') {
        socket.on('admin_start_timer', (raceCategory) => {
            if (timers[raceCategory] && !timers[raceCategory].running) {
                timers[raceCategory].lastStartTime = Date.now();
                timers[raceCategory].running = true;
                startTimerInterval(raceCategory);
                console.log(`Admin started ${raceCategory} timer`);
                broadcastTimers();
            }
        });

        socket.on('admin_pause_timer', (raceCategory) => {
            if (timers[raceCategory] && timers[raceCategory].running) {
                timers[raceCategory].elapsedTime += Date.now() - timers[raceCategory].lastStartTime;
                timers[raceCategory].running = false;
                if (timers[raceCategory].intervalId) clearInterval(timers[raceCategory].intervalId);
                timers[raceCategory].intervalId = null;
                console.log(`Admin paused ${raceCategory} timer`);
                broadcastTimers();
            }
        });

        socket.on('admin_reset_timer', (raceCategory) => {
            if (timers[raceCategory]) {
                timers[raceCategory].running = false;
                timers[raceCategory].elapsedTime = 0;
                timers[raceCategory].lastStartTime = 0;
                if (timers[raceCategory].intervalId) clearInterval(timers[raceCategory].intervalId);
                timers[raceCategory].intervalId = null;
                
                // Reset split times terkait
                if (raceCategory === '10K') {
                    splitTimes['10K_MALE'] = [];
                    splitTimes['10K_FEMALE'] = [];
                } else if (raceCategory === '5K') {
                    splitTimes['5K_MALE'] = [];
                    splitTimes['5K_FEMALE'] = [];
                }
                console.log(`Admin reset ${raceCategory} timer and splits`);
                broadcastTimers();
                broadcastSplits();
            }
        });

        socket.on('admin_delete_split', ({ splitCategory, splitId }) => {
            if (splitTimes[splitCategory]) {
                splitTimes[splitCategory] = splitTimes[splitCategory].filter(split => split.id !== splitId);
                broadcastSplits();
                console.log(`Admin deleted split ${splitId} from ${splitCategory}`);
            }
        });
    }

    // Handler untuk Time Keeper
    const isTimeKeeper10K = socket.user && socket.user.role === 'TIME_KEEPER_10K';
    const isTimeKeeper5K = socket.user && socket.user.role === 'TIME_KEEPER_5K';
    const isAdmin = socket.user && socket.user.role === 'ADMIN';


    socket.on('record_split', (splitCategory) => { // splitCategory: '10K_MALE', '10K_FEMALE', '5K_MALE', '5K_FEMALE'
        const raceCategory = splitCategory.startsWith('10K') ? '10K' : '5K';
        
        // Otorisasi: Admin bisa split apa saja, TK 10K hanya bisa 10K, TK 5K hanya bisa 5K
        const canRecordSplit = isAdmin ||
                               (isTimeKeeper10K && raceCategory === '10K') ||
                               (isTimeKeeper5K && raceCategory === '5K');

        if (canRecordSplit && timers[raceCategory] && timers[raceCategory].running) {
            let currentTime = timers[raceCategory].elapsedTime;
            if (timers[raceCategory].running) { // Selalu true jika masuk sini, tapi double check
                currentTime += Date.now() - timers[raceCategory].lastStartTime;
            }
            
            const newSplit = {
                id: Date.now() + Math.random(), // ID unik sederhana
                time: formatTimeMs(currentTime),
                bib: '' // BIB Number default kosong
            };
            splitTimes[splitCategory].push(newSplit);
            splitTimes[splitCategory].sort((a, b) => a.time.localeCompare(b.time)); // Urutkan
            broadcastSplits();
            console.log(`Split recorded for ${splitCategory}: ${newSplit.time}`);
        } else {
            console.log(`Failed to record split for ${splitCategory}. Timer not running or unauthorized.`);
            socket.emit('action_error', { message: `Gagal mencatat split untuk ${splitCategory}. Timer mungkin tidak berjalan atau Anda tidak berwenang.` });
        }
    });

    // Handler untuk update BIB number (bisa diakses Admin atau Time Keeper yang sesuai)
    socket.on('update_bib', ({ splitCategory, splitId, bibNumber }) => {
        const raceCategory = splitCategory.startsWith('10K') ? '10K' : '5K';
        const canUpdateBib = isAdmin ||
                             (isTimeKeeper10K && raceCategory === '10K') ||
                             (isTimeKeeper5K && raceCategory === '5K');

        if (canUpdateBib && splitTimes[splitCategory]) {
            const splitToUpdate = splitTimes[splitCategory].find(split => split.id === splitId);
            if (splitToUpdate) {
                splitToUpdate.bib = bibNumber;
                broadcastSplits();
                console.log(`BIB updated for ${splitCategory}, splitId ${splitId} to ${bibNumber}`);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Klien terputus:', socket.id);
    });
});


server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
