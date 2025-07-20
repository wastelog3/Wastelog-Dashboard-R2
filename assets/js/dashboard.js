document.addEventListener("DOMContentLoaded", () => {
    // --- AUTH CHECK & CONFIG ---
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'login.html';
        return;
    }
    // GANTI IP ADDRESS INI DENGAN IP NODE-RED ANDA
    const NODE_RED_URL = 'https://wastelog-nodered-services.up.railway.app';
    const WEBSOCKET_URL = 'https://wastelog-nodered-services.up.railway.app/ws/realtimelocation';
    const DEVICE_ID = 'gps_wastelog_01';

    // --- ELEMENTS ---
    const dashboardContainer = document.getElementById('dashboard-container');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const calendarEl = document.getElementById('calendar');
    const logoutButton = document.getElementById('logoutButton');
    const manualMeasureBtn = document.getElementById('manualMeasureBtn');
    const mapElement = document.getElementById('map');
    const addGeofenceBtn = document.getElementById('addGeofenceBtn');
    const geofenceFormContainer = document.getElementById('geofenceFormContainer');
    const geofenceForm = document.getElementById('geofenceForm');
    const cancelGeofenceBtn = document.getElementById('cancelGeofence');
    const geofenceTableBody = document.querySelector('#geofenceTable tbody');
    const eventPopover = document.getElementById('event-popover');
    
    // Elemen untuk kartu hasil pengukuran manual
    const manualMeasureResultCard = document.getElementById('manualMeasureResultCard');
    const manualVolumeEl = document.getElementById('manualVolume');
    const manualDistanceEl = document.getElementById('manualDistance');
    const manualTimestampEl = document.getElementById('manualTimestamp');
      
    // --- STATE ---
    let geofenceData = [];

    // --- MAP SETUP ---
    const map = L.map(mapElement).setView([-7.414038, 109.373714], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    const vehicleIcon = L.icon({ iconUrl: 'assets/images/truck.png', iconSize: [45, 45], iconAnchor: [22, 44], popupAnchor: [0, -45] });
    let vehicleMarker = L.marker([0, 0], { icon: vehicleIcon }).addTo(map).bindPopup("Lokasi Truk Sampah");
    let geofenceLayers = L.layerGroup().addTo(map);

    // --- FUNGSI-FUNGSI ---
    const fetchInitialVehicleLocation = async () => {
        try {
            const response = await fetch(`${NODE_RED_URL}/api/realtimelocation?deviceId=${DEVICE_ID}`);
            if (!response.ok) throw new Error(`Server Response: ${response.status}`);
            const data = await response.json();
            if (data.latitude && data.longitude) {
                const initialLatLng = [data.latitude, data.longitude];
                vehicleMarker.setLatLng(initialLatLng);
                map.setView(initialLatLng, 16);
            }
        } catch (error) {
            console.error("Gagal mengambil lokasi awal:", error);
        }
    };
    
    const connectWebSocket = () => {
        const ws = new WebSocket(WEBSOCKET_URL);
        ws.onopen = () => console.log('WebSocket terhubung!');
        ws.onmessage = (event) => {
            try {
                // Logika ini disesuaikan untuk menerima data manual juga
                const data = JSON.parse(event.data);
                if (data.deviceId !== DEVICE_ID) return; // Hanya proses data untuk device ini

                // Jika data lokasi dari GPS
                if (data.latitude && data.longitude) {
                    const newLatLng = [data.latitude, data.longitude];
                    if(vehicleMarker) {
                       vehicleMarker.setLatLng(newLatLng);
                       map.panTo(newLatLng);
                    }
                }
                
                // Jika data pengukuran manual
                // Alur Node-RED akan meneruskan pesan jika source='manual'
                if (data.source === 'manual' && data.event === 'VOLUME_MEASUREMENT') {
                    console.log('Menerima update pengukuran manual via WebSocket:', data);
                    // Update kartu secara real-time
                    manualVolumeEl.textContent = `${data.calculatedVolume_liter.toFixed(2)} Liter`;
                    manualDistanceEl.textContent = `${data.distance_cm} cm`;
                    manualTimestampEl.textContent = new Date(data.timestamp).toLocaleString('id-ID');
                    manualMeasureResultCard.style.display = 'block';
                }

            } catch (e) {
                console.error("Gagal mem-parsing data WebSocket:", e);
            }
        };
        ws.onerror = (err) => console.error('WebSocket error:', err);
        ws.onclose = () => {
            console.log('WebSocket terputus. Mencoba menghubungkan kembali dalam 5 detik...');
            setTimeout(connectWebSocket, 5000);
        };
    };

    const renderGeofences = (geofences) => {
        geofenceLayers.clearLayers();
        geofenceTableBody.innerHTML = '';
        geofences.forEach(fence => {
            const innerRadius = Math.min(fence.radius1, fence.radius2);
            const outerRadius = Math.max(fence.radius1, fence.radius2);
            L.circle([fence.latitude, fence.longitude], { radius: innerRadius, color: '#2E7D32', weight: 2, fillOpacity: 0.1 }).addTo(geofenceLayers).bindTooltip(fence.nama);
            L.circle([fence.latitude, fence.longitude], { radius: outerRadius, color: '#D32F2F', weight: 2, fillOpacity: 0.1, dashArray: '5, 10' }).addTo(geofenceLayers);
            
            const row = document.createElement('tr');
            row.setAttribute('data-id', fence.id);
            row.innerHTML = `<td>${fence.nama}</td><td><button class="btn btn-secondary btn-sm edit-btn" data-id="${fence.id}">Edit</button> <button class="btn btn-danger btn-sm delete-btn" data-id="${fence.id}">Hapus</button></td>`;
            geofenceTableBody.appendChild(row);
        });
    };
      
    const fetchAndDisplayGeofences = async () => { 
        try { 
            const response = await fetch(`${NODE_RED_URL}/api/geofences`);
            if (!response.ok) throw new Error("Gagal mengambil data dari server");
            geofenceData = await response.json();
            renderGeofences(geofenceData);
        } catch (error) { 
            console.error('Gagal mengambil data geofence:', error);
            alert('Gagal memuat data area geofence.');
        } 
    };
      
    const showGeofenceForm = (fence = null) => {
        geofenceForm.reset();
        document.getElementById('geofenceId').value = '';
        if (fence) {
            document.getElementById('geofenceId').value = fence.id;
            document.getElementById('geofenceName').value = fence.nama;
            document.getElementById('geofenceLat').value = fence.latitude;
            document.getElementById('geofenceLon').value = fence.longitude;
            document.getElementById('geofenceRadius1').value = Math.min(fence.radius1, fence.radius2);
            document.getElementById('geofenceRadius2').value = Math.max(fence.radius1, fence.radius2);
        }
        geofenceFormContainer.classList.remove('hidden');
    };
    
    // --- EVENT LISTENERS ---
    sidebarToggle.addEventListener('click', () => {
        dashboardContainer.classList.toggle('sidebar-closed');
        setTimeout(() => map.invalidateSize(), 300); 
    });

    logoutButton.addEventListener('click', () => { 
        localStorage.clear();
        window.location.href = 'index.html'; 
    });

    manualMeasureBtn.addEventListener('click', async () => {
        if (!confirm('Anda yakin ingin memicu pengukuran volume manual?')) return;
        
        const originalButtonText = manualMeasureBtn.innerHTML;
        manualMeasureBtn.disabled = true;
        manualMeasureBtn.innerHTML = `<i class="fas fa-spinner fa-spin fa-fw"></i> <span class="nav-text">Mengirim...</span>`;
        manualMeasureResultCard.style.display = 'none';

        try {
            const response = await fetch(`${NODE_RED_URL}/api/measure`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trigger: true, deviceId: DEVICE_ID }) 
            });

            if (response.status !== 202) { 
                throw new Error(`Server menolak perintah. Status: ${response.status}`);
            }
            
            manualMeasureBtn.innerHTML = `<i class="fas fa-check"></i> <span class="nav-text">Terkirim</span>`;

        } catch (error) { 
            console.error('Gagal memicu pengukuran manual:', error); 
            alert(`Gagal memicu pengukuran manual. \n\nError: ${error.message}`);
            manualMeasureBtn.innerHTML = originalButtonText;
        } finally {
            setTimeout(() => {
                manualMeasureBtn.disabled = false;
                manualMeasureBtn.innerHTML = originalButtonText;
            }, 4000);
        }
    });

    addGeofenceBtn.addEventListener('click', () => showGeofenceForm());
    cancelGeofenceBtn.addEventListener('click', () => geofenceFormContainer.classList.add('hidden'));
    
    map.on('click', (e) => { 
        if (!geofenceFormContainer.classList.contains('hidden')) { 
            document.getElementById('geofenceLat').value = e.latlng.lat.toFixed(6); 
            document.getElementById('geofenceLon').value = e.latlng.lng.toFixed(6); 
        } 
    });
      
    geofenceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('geofenceId').value;
        const body = { 
            nama: document.getElementById('geofenceName').value, 
            latitude: parseFloat(document.getElementById('geofenceLat').value), 
            longitude: parseFloat(document.getElementById('geofenceLon').value), 
            radius1: parseInt(document.getElementById('geofenceRadius1').value, 10), 
            radius2: parseInt(document.getElementById('geofenceRadius2').value, 10)
        };
        try {
            const response = await fetch(id ? `${NODE_RED_URL}/api/geofences/${id}` : `${NODE_RED_URL}/api/geofences`, { 
                method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) 
            });
            if (response.ok) {
                geofenceFormContainer.classList.add('hidden');
                fetchAndDisplayGeofences();
            } else {
                alert('Gagal menyimpan geofence. Status: ' + response.status);
            }
        } catch (error) { 
            console.error('Error menyimpan geofence:', error); 
            alert('Terjadi kesalahan saat menyimpan data.');
        }
    });

    geofenceTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.dataset.id;
        if (!id) return;

        if (target.classList.contains('edit-btn')) {
            const fenceToEdit = geofenceData.find(f => f.id === id);
            if (fenceToEdit) showGeofenceForm(fenceToEdit);
        } else if (target.classList.contains('delete-btn')) {
            if (confirm('Anda yakin ingin menghapus area ini?')) {
                try {
                    await fetch(`${NODE_RED_URL}/api/geofences/${id}`, { method: 'DELETE' });
                    fetchAndDisplayGeofences();
                } catch (error) {
                    console.error('Gagal menghapus geofence:', error);
                    alert('Gagal menghapus area.');
                }
            }
        }
    });
      
    // --- KALENDER SETUP & LOGIKA (DISESUAIKAN) ---
    const formatTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./g,':') : '-';
    const formatDuration = (seconds) => (seconds === null || seconds === undefined) ? '-' : `${Math.round(seconds / 60)} menit`;
    const formatVolume = (liters) => (liters === null || liters === undefined) ? '-' : `${liters.toFixed(2)} L`;
      
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'id',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek,listWeek' },
        buttonText: { dayGridMonth: 'Bulan', dayGridWeek: 'Minggu', listWeek: 'Daftar' },
        eventContent: (arg) => { /* Tidak ada perubahan di sini */ },
        
        // --- PENYESUAIAN 2: PERBARUI TAMPILAN DETAIL EVENT ---
        eventClick: (info) => {
            const visit = info.event.extendedProps;
            const measurement = visit.measurement || {};

            // Menggunakan backtick (`) untuk membuat template string HTML yang lebih mudah dibaca
            const popoverContent = `
                <h5>${visit.areaName || 'Detail Kunjungan'}</h5>
                <hr>
                <p><strong>Status:</strong> <span class="badge bg-success">${visit.status || 'Selesai'}</span></p>
                <p><strong>Masuk:</strong> ${formatTime(visit.entryTime)}</p>
                <p><strong>Keluar:</strong> ${formatTime(visit.exitTime)}</p>
                <p><strong>Durasi:</strong> ${formatDuration(visit.durationSeconds)}</p>
                <hr>
                <p><strong>Volume Awal:</strong> ${formatVolume(measurement.initialVolume_liter)}</p>
                <p><strong>Volume Akhir:</strong> ${formatVolume(measurement.finalVolume_liter)}</p>
                <p><strong><i class="fas fa-wine-bottle fa-fw"></i> Volume Terkumpul:</strong> <strong>${formatVolume(visit.collectedVolume_liter)}</strong></p>
            `;

            // Logika untuk menampilkan popover (tidak perlu diubah)
            eventPopover.innerHTML = popoverContent;
            const popover = new bootstrap.Popover(info.el, {
                title: "Detail Kunjungan",
                content: popoverContent,
                html: true,
                placement: 'auto',
                trigger: 'focus'
            });
            popover.show();
        }
    });
    calendar.render();

    // --- PENYESUAIAN 1: SEDERHANAKAN FUNGSI PENGAMBILAN DATA ---
    const fetchHistoryAndRender = async () => {
        try {
            // Endpoint API ini harus sudah diperbarui di Node-RED untuk membaca dari 'visit_logs'
            const response = await fetch(`${NODE_RED_URL}/api/history`);
            if (!response.ok) throw new Error("Gagal mengambil data histori dari server");
    
            const visitLogs = await response.json();
            
            // Logika baru yang lebih sederhana, langsung memetakan data yang sudah lengkap
            const calendarEvents = visitLogs.map(visit => {
                const title = visit.areaName || 'Area Tidak Dikenal';
                const startTime = visit.entryTime || new Date().toISOString();
                
                return {
                    title: title,
                    start: startTime,
                    // extendedProps sekarang berisi SEMUA data dari dokumen visit_logs
                    extendedProps: visit 
                };
            });
            
            calendar.getEventSources().forEach(source => source.remove());
            calendar.addEventSource(calendarEvents);
    
        } catch (error) {
            console.error('Terjadi error saat memproses data histori:', error);
        }
    };
      
    // --- INISIALISASI DASHBOARD ---
    const initializeDashboard = () => {
        fetchInitialVehicleLocation(); 
        connectWebSocket();
        fetchAndDisplayGeofences().then(() => {
            fetchHistoryAndRender(); // Panggil setelah geofence dimuat agar nama area tersedia
        });
        setInterval(fetchHistoryAndRender, 60000); // Refresh data setiap 60 detik
    };

    initializeDashboard();
});
