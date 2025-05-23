// /full/path/to/your/project/running-event-timer/public/js/viewer.js
const socket = io();

function formatTimeMs(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return '00:00:00.000';
    const milliseconds = String(ms % 1000).padStart(3, '0');
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

socket.on('initial_state', (state) => {
    console.log('Initial state received:', state);
    updateTimers(state.timers);
    updateAllSplits(state.splitTimes);
});

socket.on('time_update', (data) => {
    // console.log('Time update:', data);
    const timerEl = document.getElementById(`timer-${data.raceCategory}`);
    if (timerEl) {
        timerEl.textContent = formatTimeMs(data.time);
    }
});

socket.on('splits_update', (allSplits) => {
    console.log('Splits update:', allSplits);
    updateAllSplits(allSplits);
});

function updateTimers(timersState) {
    for (const raceCategory in timersState) {
        const timerData = timersState[raceCategory];
        let displayTime = timerData.elapsedTime;
        if (timerData.running) {
            // Perkiraan di client, server akan mengirim update akurat
            // Untuk viewer, cukup tampilkan apa yang dikirim server via 'time_update'
        }
        const timerEl = document.getElementById(`timer-${raceCategory}`);
        if (timerEl) {
            // Initial state might not have 'time' directly if not running, use elapsedTime
            timerEl.textContent = formatTimeMs(timerData.elapsedTime);
        }
    }
}


function updateAllSplits(allSplits) {
    for (const category in allSplits) {
        const tableBody = document.getElementById(`splits-${category}`)?.querySelector('tbody');
        if (tableBody) {
            tableBody.innerHTML = ''; // Kosongkan tabel body
            allSplits[category].forEach((split, index) => {
                const tr = document.createElement('tr');
                
                const rankTd = document.createElement('td');
                rankTd.textContent = index + 1; // Rank dimulai dari 1
                tr.appendChild(rankTd);

                const timeTd = document.createElement('td');
                timeTd.textContent = split.time;
                timeTd.style.fontSize = "1.2em"; // Perbesar font waktu split
                tr.appendChild(timeTd);

                const bibTd = document.createElement('td');
                bibTd.textContent = split.bib || '-'; // Tampilkan BIB atau strip jika kosong
                tr.appendChild(bibTd);

                tableBody.appendChild(tr);
            });
        }
    }
}
