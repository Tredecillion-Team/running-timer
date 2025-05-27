// /full/path/to/your/project/running-event-timer/public/js/control.js
let socket; // Akan diinisialisasi setelah login

const loginForm = document.getElementById('login-form');
const loginSection = document.getElementById('login-section');
const controlPanelSection = document.getElementById('control-panel-section');
const userGreeting = document.getElementById('user-greeting');
const userRoleDisplay = document.getElementById('user-role');
const logoutButton = document.getElementById('logout-button');
const loginError = document.getElementById('login-error');
const actionError = document.getElementById('action-error');

const adminControls = document.getElementById('admin-controls');
const timekeeperControls = document.getElementById('timekeeper-controls');
const tk10kSection = document.getElementById('tk-10k-section');
const tk5kSection = document.getElementById('tk-5k-section');

const timer10KDisplayWrapper = document.getElementById('timer-10k-display-wrapper');
const timer5KDisplayWrapper = document.getElementById('timer-5k-display-wrapper');

function formatTimeMs(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return '00:00:00.000';
    const milliseconds = String(ms % 1000).padStart(3, '0');
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// Cek status login saat halaman dimuat
fetch('/check-auth')
    .then(res => res.json())
    .then(data => {
        if (data.loggedIn) {
            showControlPanel(data.user);
            initializeSocket();
        }
    });

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const username = loginForm.username.value;
    const password = loginForm.password.value;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (data.success) {
            showControlPanel({ username, role: data.role });
            initializeSocket();
        } else {
            loginError.textContent = data.message || 'Login gagal.';
        }
    } catch (err) {
        loginError.textContent = 'Terjadi kesalahan saat login.';
    }
});

logoutButton.addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' });
    if (socket) socket.disconnect();
    loginSection.style.display = 'block';
    controlPanelSection.style.display = 'none';
    adminControls.style.display = 'none';
    timekeeperControls.style.display = 'none';
});

function showControlPanel(user) {
    loginSection.style.display = 'none';
    controlPanelSection.style.display = 'block';
    userGreeting.textContent = user.username;
    userRoleDisplay.textContent = user.role;

    adminControls.style.display = 'none';
    timekeeperControls.style.display = 'none';
    tk10kSection.style.display = 'none';
    tk5kSection.style.display = 'none';

    // Default: sembunyikan kedua timer display wrappers
    if(timer10KDisplayWrapper) timer10KDisplayWrapper.style.display = 'none';
    if(timer5KDisplayWrapper) timer5KDisplayWrapper.style.display = 'none';

    // Sembunyikan kontainer tabel TK secara default, HTML sudah melakukan ini
    // tapi kita bisa pastikan di sini jika ada perubahan dinamis sebelumnya.
    const tk10kTableContainer = tk10kSection.querySelector('.split-times-container.tk-splits');
    if (tk10kTableContainer) tk10kTableContainer.style.display = 'none';
    const tk5kTableContainer = tk5kSection.querySelector('.split-times-container.tk-splits');
    if (tk5kTableContainer) tk5kTableContainer.style.display = 'none';

    if (user.role === 'ADMIN') {
        adminControls.style.display = 'block';
        // Admin juga bisa split, jadi tampilkan juga tombol split
        // dari timekeeperControls, tk10kSection, dan tk5kSection.
        // Tabel di dalam tk10kSection dan tk5kSection (tk-splits) akan tetap
        // tersembunyi karena style="display: none;" di HTML.
        timekeeperControls.style.display = 'block';
        tk10kSection.style.display = 'block';
        tk5kSection.style.display = 'block';

        // Admin melihat kedua timer
        if(timer10KDisplayWrapper) timer10KDisplayWrapper.style.display = 'block';
        if(timer5KDisplayWrapper) timer5KDisplayWrapper.style.display = 'block';

    } else if (user.role === 'TIME_KEEPER_10K') {
        timekeeperControls.style.display = 'block';
        tk10kSection.style.display = 'block';
        // Tampilkan tabel split untuk Time Keeper 10K
        if (tk10kTableContainer) {
            tk10kTableContainer.style.display = 'flex'; // Atau 'flex' jika layoutnya flex
        }

        // Time Keeper 10K hanya melihat timer 10K
        if(timer10KDisplayWrapper) timer10KDisplayWrapper.style.display = 'block';
        if(timer5KDisplayWrapper) timer5KDisplayWrapper.style.display = 'none';
    } else if (user.role === 'TIME_KEEPER_5K') {
        timekeeperControls.style.display = 'block';
        tk5kSection.style.display = 'block';
        // Tampilkan tabel split untuk Time Keeper 5K
        if (tk5kTableContainer) {
            tk5kTableContainer.style.display = 'flex'; // Atau 'flex' jika layoutnya flex
        }

        // Time Keeper 5K hanya melihat timer 5K
        if(timer5KDisplayWrapper) timer5KDisplayWrapper.style.display = 'block';
        if(timer10KDisplayWrapper) timer10KDisplayWrapper.style.display = 'none';
    }
}

function initializeSocket() {
    if (socket) socket.disconnect(); // Tutup koneksi lama jika ada

    socket = io({
        // Opsi ini mungkin diperlukan jika session tidak terbawa otomatis
        // transports: ['websocket'], // Coba ini jika ada masalah session
        // auth: { token: "abc" } // Jika menggunakan token auth, bukan session cookie
    });

    socket.on('connect', () => {
        console.log('Terhubung ke server via WebSocket');
        actionError.textContent = '';
    });
    
    socket.on('connect_error', (err) => {
        console.error('Koneksi WebSocket gagal:', err.message);
        actionError.textContent = `Koneksi WebSocket gagal: ${err.message}. Coba refresh.`;
    });

    socket.on('initial_state', (state) => {
        console.log('Initial state received for control panel:', state);
        updateTimersDisplay(state.timers);
        updateAllSplitsDisplay(state.splitTimes);
    });

    socket.on('time_update', (data) => {
        // Sesuaikan ID elemen timer yang diupdate
        const timerEl10K = document.getElementById('control-timer-10K');
        const timerEl5K = document.getElementById('control-timer-5K');

        const timerEl = (data.raceCategory === '10K') ? timerEl10K : timerEl5K;
        if (timerEl) {
            timerEl.textContent = formatTimeMs(data.time);
        }
    });

    socket.on('splits_update', (allSplits) => {
        updateAllSplitsDisplay(allSplits);
    });
    
    socket.on('action_error', (data) => {
        actionError.textContent = data.message;
        setTimeout(() => actionError.textContent = '', 5000);
    });

    setupEventListeners();
}

// Definisikan variabel untuk menyimpan referensi ke fungsi event handler
// Ini memungkinkan kita untuk menghapusnya dengan benar nanti.
let handleAdminStart10K, handleAdminPause10K, handleAdminReset10K;
let handleAdminStart5K, handleAdminPause5K, handleAdminReset5K;
let handleSplitButtonClick;
let handleDeleteSplitClick; // Untuk tombol delete split di Admin view


function updateTimersDisplay(timersState) {
     for (const raceCategory in timersState) {
        const timerData = timersState[raceCategory];
        // Sesuaikan ID elemen timer
        const timerEl10K = document.getElementById('control-timer-10K');
        const timerEl5K = document.getElementById('control-timer-5K');
        const targetEl = raceCategory === '10K' ? timerEl10K : timerEl5K;
        if (targetEl) {
            // Gunakan elapsedTime dari state awal, karena 'time' di 'time_update' adalah yang paling baru
            targetEl.textContent = formatTimeMs(timerData.elapsedTime);
        }
    }
}


function updateAllSplitsDisplay(allSplits) {
    const isAdmin = userRoleDisplay.textContent === 'ADMIN';
    const role = userRoleDisplay.textContent;

    for (const category in allSplits) {
        let tableIdSuffix = category; // e.g., 10K_MALE
        let tableBody;

        if (isAdmin) {
            tableBody = document.getElementById(`admin-splits-${tableIdSuffix}`)?.querySelector('tbody');
        } else if (role === 'TIME_KEEPER_10K' && category.startsWith('10K')) {
            tableBody = document.getElementById(`tk-splits-${tableIdSuffix}`)?.querySelector('tbody');
        } else if (role === 'TIME_KEEPER_5K' && category.startsWith('5K')) {
            tableBody = document.getElementById(`tk-splits-${tableIdSuffix}`)?.querySelector('tbody');
        }

        if (tableBody) {
            tableBody.innerHTML = ''; // Kosongkan tabel body
            allSplits[category].forEach((split, index) => {
                const tr = document.createElement('tr');
                
                const rankTd = document.createElement('td');
                rankTd.textContent = index + 1;
                tr.appendChild(rankTd);

                const timeTd = document.createElement('td');
                timeTd.textContent = split.time;
                timeTd.style.fontSize = "1.1em"; // Perbesar sedikit font waktu
                tr.appendChild(timeTd);

                const bibTd = document.createElement('td');
                const bibInput = document.createElement('input');
                bibInput.type = 'text';
                bibInput.value = split.bib || '';
                bibInput.placeholder = 'No. BIB';
                bibInput.dataset.splitId = split.id;
                bibInput.dataset.category = category;
                bibInput.classList.add('bib-input');
                bibTd.appendChild(bibInput);
                tr.appendChild(bibTd);

                const actionTd = document.createElement('td');
                const saveBibButton = document.createElement('button');
                saveBibButton.textContent = 'Simpan';
                saveBibButton.classList.add('save-bib-btn');
                saveBibButton.onclick = () => {
                    socket.emit('update_bib', { 
                        splitCategory: category, 
                        splitId: split.id, 
                        bibNumber: bibInput.value 
                    });
                };
                actionTd.appendChild(saveBibButton);

                if (isAdmin) {
                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'X';
                    deleteButton.classList.add('delete-split-btn');
                    deleteButton.onclick = () => {
                        if (confirm(`Yakin ingin menghapus split ${split.time} dari ${category}?`)) {
                            socket.emit('admin_delete_split', { splitCategory: category, splitId: split.id });
                        }
                    };
                    actionTd.appendChild(deleteButton);
                }
                tr.appendChild(actionTd);
+                tableBody.appendChild(tr);
            });
        }
    }
}


function setupEventListeners() {
    // Dapatkan referensi ke elemen tombol
    const start10KButton = document.getElementById('start-10K');
    const pause10KButton = document.getElementById('pause-10K');
    const reset10KButton = document.getElementById('reset-10K');
    const start5KButton = document.getElementById('start-5K');
    const pause5KButton = document.getElementById('pause-5K');
    const reset5KButton = document.getElementById('reset-5K');
    const splitButtons = document.querySelectorAll('.split-button');

    // Hapus event listener yang mungkin sudah ada sebelumnya
    if (start10KButton && handleAdminStart10K) start10KButton.removeEventListener('click', handleAdminStart10K);
    if (pause10KButton && handleAdminPause10K) pause10KButton.removeEventListener('click', handleAdminPause10K);
    if (reset10KButton && handleAdminReset10K) reset10KButton.removeEventListener('click', handleAdminReset10K);
    if (start5KButton && handleAdminStart5K) start5KButton.removeEventListener('click', handleAdminStart5K);
    if (pause5KButton && handleAdminPause5K) pause5KButton.removeEventListener('click', handleAdminPause5K);
    if (reset5KButton && handleAdminReset5K) reset5KButton.removeEventListener('click', handleAdminReset5K);

    if (handleSplitButtonClick) {
        splitButtons.forEach(button => {
            button.removeEventListener('click', handleSplitButtonClick);
        });
    }

    // Definisikan fungsi event handler yang baru
    // Fungsi-fungsi ini akan menggunakan instance `socket` yang terbaru dari scope `initializeSocket`
    handleAdminStart10K = () => socket.emit('admin_start_timer', '10K');
    handleAdminPause10K = () => socket.emit('admin_pause_timer', '10K');
    handleAdminReset10K = () => {
        if (confirm("Yakin ingin mereset timer 10K? Ini akan menghapus semua split time 10K.")) {
            socket.emit('admin_reset_timer', '10K');
        }
    };

    handleAdminStart5K = () => socket.emit('admin_start_timer', '5K');
    handleAdminPause5K = () => socket.emit('admin_pause_timer', '5K');
    handleAdminReset5K = () => {
         if (confirm("Yakin ingin mereset timer 5K? Ini akan menghapus semua split time 5K.")) {
            socket.emit('admin_reset_timer', '5K');
        }
    };

    handleSplitButtonClick = (event) => {
        // `event.currentTarget` merujuk ke elemen tombol yang memiliki listener
        const button = event.currentTarget;
        const category = button.dataset.category;
        socket.emit('record_split', category);
    };

    // Admin controls
    if (start10KButton) start10KButton.addEventListener('click', handleAdminStart10K);
    if (pause10KButton) pause10KButton.addEventListener('click', handleAdminPause10K);
    if (reset10KButton) reset10KButton.addEventListener('click', handleAdminReset10K);

    if (start5KButton) start5KButton.addEventListener('click', handleAdminStart5K);
    if (pause5KButton) pause5KButton.addEventListener('click', handleAdminPause5K);
    if (reset5KButton) reset5KButton.addEventListener('click', handleAdminReset5K);


    // Time Keeper controls (juga bisa diakses Admin)
    splitButtons.forEach(button => {
        button.addEventListener('click', handleSplitButtonClick);
    });
}
