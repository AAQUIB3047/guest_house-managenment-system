// App State and LocalStorage Manager
const StateManager = {
    keyPrefix: 'staysync_',
    
    defaults: {
        rooms: [],
        services: [],
        expenses: [],
        incomes: [],
        activities: [
            { id: 'act1', type: 'system', text: 'System initialized. Add rooms to get started!', time: new Date().toISOString() }
        ]
    },

    load(key) {
        const data = localStorage.getItem(this.keyPrefix + key);
        return data ? JSON.parse(data) : this.defaults[key];
    },

    save(key, data) {
        localStorage.setItem(this.keyPrefix + key, JSON.stringify(data));
    },

    reset() {
        Object.keys(this.defaults).forEach(key => {
            localStorage.removeItem(this.keyPrefix + key);
        });
        window.location.reload();
    }
};

// Force-wipe old localStorage dummy data once on version upgrade
if (!localStorage.getItem('staysync_v2_initialized')) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('staysync_')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    localStorage.setItem('staysync_v2_initialized', 'true');
}

// Application State
const App = {
    rooms: [],
    services: [],
    expenses: [],
    incomes: [],
    activities: [],
    version: 0, // Server state version timestamp
    userName: '', // Current user identifier
    toastTimeout: null, // Timer handler for slide-out toasts
    currentTab: 'dashboard',
    roomFilter: 'all',
    calcState: {
        expression: '',
        result: null
    },

    async init() {
        this.bindEvents();
        this.updateDateDisplay();

        // Register Service Worker for PWA offline capability
        this.registerServiceWorker();

        // Check user setup
        const storedName = localStorage.getItem('staysync_user_name');
        if (storedName) {
            this.userName = storedName;
            await this.loadFromServer();
            this.startSyncLoop();
        } else {
            this.openModal('modal-user-setup');
            // Hide bottom nav and overlays during setup
            document.querySelector('.app-nav').style.display = 'none';
        }
    },

    async loadFromServer() {
        try {
            const response = await fetch('./api/state');
            if (response.ok) {
                const state = await response.json();
                this.rooms = state.rooms;
                this.services = state.services;
                this.expenses = state.expenses;
                this.incomes = state.incomes;
                this.activities = state.activities;
                this.version = state.version;
                
                // Render view
                this.renderAll();
                lucide.createIcons();
            }
        } catch (err) {
            console.error('Failed to sync data from server:', err);
        }
    },

    async saveAll() {
        const payload = {
            rooms: this.rooms,
            services: this.services,
            expenses: this.expenses,
            incomes: this.incomes,
            activities: this.activities
        };

        try {
            const response = await fetch('./api/state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const savedState = await response.json();
                this.version = savedState.version; // Sync local version with server
            }
        } catch (err) {
            console.error('Failed to save state to server:', err);
        }
    },

    startSyncLoop() {
        setInterval(async () => {
            try {
                const response = await fetch('./api/state');
                if (response.ok) {
                    const state = await response.json();
                    // If server version is newer, sync and refresh
                    if (state.version !== this.version) {
                        const latest = state.activities[0];
                        
                        // Check if latest change is from someone else
                        if (latest && latest.author && latest.author !== this.userName) {
                            this.showToast(latest);
                        }

                        this.rooms = state.rooms;
                        this.services = state.services;
                        this.expenses = state.expenses;
                        this.incomes = state.incomes;
                        this.activities = state.activities;
                        this.version = state.version;
                        
                        this.renderAll();
                        lucide.createIcons();
                        console.log('Real-time sync complete. New version:', this.version);
                    }
                }
            } catch (err) {
                console.warn('Sync loop communication warning:', err);
            }
        }, 4000);
    },

    showToast(activity) {
        const toast = document.getElementById('toast-notify');
        const toastTitle = document.getElementById('toast-notify-title');
        const toastMessage = document.getElementById('toast-notify-message');
        const toastIcon = document.getElementById('toast-notify-icon');

        // Set Title
        toastTitle.textContent = `${activity.author} updated StaySync`;
        
        // Strip HTML tags for clean text message
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = activity.text;
        const fullCleanedText = tempDiv.textContent || tempDiv.innerText || "";
        const mainMessage = fullCleanedText.split('done by')[0].trim();
        toastMessage.textContent = mainMessage;

        // Set Icon
        let iconName = 'bell';
        if (activity.type === 'checkin') iconName = 'user-check';
        else if (activity.type === 'checkout') iconName = 'credit-card';
        else if (activity.type === 'expense') iconName = 'trending-down';
        else if (activity.type === 'service') iconName = 'soup';
        
        toastIcon.innerHTML = `<i data-lucide="${iconName}"></i>`;
        lucide.createIcons();

        // Slide in
        toast.classList.add('show');

        // Slide out timer
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3800);
    },

    async reset() {
        const defaultState = {
            version: Date.now(),
            rooms: [],
            services: [],
            expenses: [],
            incomes: [],
            activities: [
                { id: 'act_reset', type: 'system', text: 'System reset to default empty state.', time: new Date().toISOString() }
            ]
        };
        try {
            const response = await fetch('./api/state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(defaultState)
            });
            if (response.ok) {
                window.location.reload();
            }
        } catch (err) {
            console.error('Failed to reset state on server:', err);
        }
    },

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Service Worker registered successfully!', reg))
                    .catch(err => console.log('Service Worker registration failed:', err));
            });
        }
    },


    logActivity(type, text) {
        const authorName = this.userName || 'Staff';
        const textWithAuthor = `${text} <span style="font-size:0.72rem; opacity:0.75; display:block; margin-top:2px;">done by <strong>${authorName}</strong></span>`;
        
        const newAct = {
            id: 'act_' + Date.now(),
            type: type,
            text: textWithAuthor,
            time: new Date().toISOString(),
            author: authorName
        };
        this.activities.unshift(newAct);
        if (this.activities.length > 50) this.activities.pop();
        this.saveAll();
    },

    updateDateDisplay() {
        const options = { weekday: 'long', month: 'short', day: 'numeric' };
        const todayStr = new Date().toLocaleDateString('en-US', options);
        document.getElementById('current-date-display').textContent = todayStr;
    },

    bindEvents() {
        // User Name Setup submission
        document.getElementById('form-user-setup').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('setup-user-name').value.trim();
            if (nameInput) {
                localStorage.setItem('staysync_user_name', nameInput);
                this.userName = nameInput;
                this.closeModal('modal-user-setup');
                document.querySelector('.app-nav').style.display = ''; // Show bottom nav
                
                await this.loadFromServer();
                this.startSyncLoop();
            }
        });

        // Tab switching
        document.querySelectorAll('.app-nav .nav-item').forEach(button => {
            button.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // Filter chips for rooms
        document.querySelectorAll('.filter-chips .chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.roomFilter = e.currentTarget.getAttribute('data-filter');
                this.renderRooms();
            });
        });

        // Modals close triggers
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    this.closeModal(backdrop.id);
                }
            });
        });

        document.querySelectorAll('.close-sheet-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.currentTarget.closest('.modal-backdrop');
                if (modal) this.closeModal(modal.id);
            });
        });

        // Add Room handlers
        document.getElementById('btn-trigger-add-room').addEventListener('click', () => this.openModal('modal-add-room'));
        document.getElementById('form-add-room').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddRoom();
        });

        // Check-In handler
        document.getElementById('form-check-in').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCheckIn();
        });

        // Check-Out billing day adjuster
        document.getElementById('checkout-actual-days').addEventListener('input', (e) => {
            this.updateCheckOutInvoice(e.target.value);
        });

        // Check-Out button
        document.getElementById('btn-confirm-checkout').addEventListener('click', () => {
            this.handleCheckOut();
        });

        // Add Service handler
        document.getElementById('btn-trigger-add-service').addEventListener('click', () => {
            this.populateServiceRoomSelect();
            this.openModal('modal-add-service');
        });
        document.getElementById('form-add-service').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddService();
        });

        // Add Expense handler
        document.getElementById('btn-trigger-add-expense').addEventListener('click', () => this.openModal('modal-add-expense'));
        document.getElementById('form-add-expense').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddExpense();
        });

        // Calculator opening / closing
        document.getElementById('open-calc-btn').addEventListener('click', () => this.openModal('modal-calculator'));
        document.getElementById('close-calc-btn').addEventListener('click', () => this.closeModal('modal-calculator'));

        // Calculator keys
        document.querySelectorAll('.calc-key').forEach(key => {
            key.addEventListener('click', (e) => {
                const val = e.currentTarget.getAttribute('data-val');
                const action = e.currentTarget.getAttribute('data-action');
                this.handleCalcInput(val, action);
            });
        });

        // Save calculator result to expense
        document.getElementById('btn-calc-save-expense').addEventListener('click', () => {
            if (this.calcState.result !== null) {
                const amount = this.calcState.result;
                this.closeModal('modal-calculator');
                
                // Open expense modal and prefill amount
                this.openModal('modal-add-expense');
                document.getElementById('expense-amount').value = amount;
                document.getElementById('expense-title').focus();
            }
        });

        // Clear Activity Logs (Double Verification)
        document.getElementById('clear-activity-btn').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the recent activity logs?')) {
                if (confirm('Double Verification: Clear them permanently?')) {
                    this.activities = [];
                    this.logActivity('system', 'Activity logs cleared.');
                    this.renderDashboard();
                }
            }
        });

        // Reset system (Double Verification with Confirmation Input)
        document.getElementById('btn-reset-system').addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all app data to default? This will clear your custom records.')) {
                const verification = prompt('Double Verification: Please type "RESET" in all capitals to confirm deletion:');
                if (verification === 'RESET') {
                    this.reset();
                } else {
                    alert('Reset cancelled. Verification text did not match.');
                }
            }
        });
    },

    // View Switching
    switchTab(tabId) {
        this.currentTab = tabId;
        
        // Navigation visual update
        document.querySelectorAll('.app-nav .nav-item').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Tabs container show/hide
        document.querySelectorAll('.tab-view').forEach(view => {
            if (view.id === `tab-${tabId}`) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        // Specialized rendering per tab
        this.renderAll();
        lucide.createIcons();
    },

    // Modal helpers
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('active');
        // Disable body scroll when modal is active
        document.body.style.overflow = 'hidden';
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
        document.body.style.overflow = '';
    },

    // Rendering Hub
    renderAll() {
        if (this.currentTab === 'dashboard') this.renderDashboard();
        else if (this.currentTab === 'rooms') this.renderRooms();
        else if (this.currentTab === 'services') this.renderServices();
        else if (this.currentTab === 'expenses') this.renderExpenses();
        else if (this.currentTab === 'analytics') this.renderAnalytics();
    },

    // 1. Dashboard View
    renderDashboard() {
        const total = this.rooms.length;
        const occupied = this.rooms.filter(r => r.status === 'occupied').length;
        const empty = total - occupied;

        document.getElementById('dash-total-rooms').textContent = total;
        document.getElementById('dash-empty-rooms').textContent = empty;
        document.getElementById('dash-occupied-rooms').textContent = occupied;

        // Calculate financials
        const totalIncome = this.incomes.reduce((acc, curr) => acc + curr.amount, 0);
        const totalExpenses = this.expenses.reduce((acc, curr) => acc + curr.amount, 0);
        const netProfit = totalIncome - totalExpenses;

        document.getElementById('dash-total-income').textContent = `₹${totalIncome.toFixed(2)}`;
        document.getElementById('dash-total-expenses').textContent = `₹${totalExpenses.toFixed(2)}`;
        
        const netEl = document.getElementById('dash-net-profit');
        netEl.textContent = `${netProfit < 0 ? '-' : ''}₹${Math.abs(netProfit).toFixed(2)}`;
        netEl.className = 'balance-amount ' + (netProfit >= 0 ? 'text-success' : 'text-danger');

        // Populate Activity Log Feed
        const actList = document.getElementById('activity-log-list');
        actList.innerHTML = '';
        if (this.activities.length === 0) {
            actList.innerHTML = '<li class="empty-list-message">No activities logged yet today.</li>';
        } else {
            this.activities.slice(0, 10).forEach(act => {
                const li = document.createElement('li');
                li.className = 'activity-item';
                
                let icon = 'info';
                let badgeClass = 'bg-primary-light color-primary';
                if (act.type === 'checkin') { badgeClass = 'bg-success-light color-success'; icon = 'user-check'; }
                else if (act.type === 'checkout') { badgeClass = 'bg-primary-light color-primary'; icon = 'credit-card'; }
                else if (act.type === 'expense') { badgeClass = 'bg-danger-light color-danger'; icon = 'trending-down'; }
                else if (act.type === 'service') { badgeClass = 'bg-warning-light color-warning'; icon = 'soup'; }
                
                const timeDiff = this.formatRelativeTime(new Date(act.time));

                li.innerHTML = `
                    <div class="activity-badge ${badgeClass}">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="activity-details">
                        <span class="activity-text">${act.text}</span>
                        <span class="activity-time">${timeDiff}</span>
                    </div>
                `;
                actList.appendChild(li);
            });
        }
        lucide.createIcons();
    },

    // Helper: Time ago
    formatRelativeTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMins / 60);
        
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHrs < 24) return `${diffHrs}h ago`;
        return date.toLocaleDateString();
    },

    // 2. Rooms View
    renderRooms() {
        const container = document.getElementById('rooms-container');
        container.innerHTML = '';

        let filteredRooms = this.rooms;
        if (this.roomFilter === 'empty') {
            filteredRooms = this.rooms.filter(r => r.status === 'empty');
        } else if (this.roomFilter === 'occupied') {
            filteredRooms = this.rooms.filter(r => r.status === 'occupied');
        }

        if(filteredRooms.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: span 2;">
                    <i data-lucide="door-closed"></i>
                    <p>No rooms match this category.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        filteredRooms.forEach(room => {
            const card = document.createElement('div');
            card.className = `room-card ${room.status}-room`;
            
            let guestHtml = '';
            let actionText = '';
            if (room.status === 'occupied') {
                guestHtml = `
                    <div class="room-guest-name">
                        <i data-lucide="user" style="width:12px;height:12px;"></i> ${room.currentGuest.name}
                    </div>
                    <div>Days: <strong>${room.currentGuest.days} days</strong></div>
                `;
                actionText = 'Click to Check-Out';
            } else {
                guestHtml = `<div>Rate: <strong>₹${room.rentPerDay}/day</strong></div>`;
                actionText = 'Click to Check-In';
            }

            card.innerHTML = `
                <div class="room-header">
                    <span class="room-num">Room ${room.number}</span>
                    <span class="room-type-badge">${room.type}</span>
                </div>
                <div class="room-status-badge">${room.status.toUpperCase()}</div>
                <div class="room-desc">
                    ${guestHtml}
                </div>
                <div class="room-price">
                    <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal; display:flex; align-items:center;">${actionText}</span>
                    <span>₹${room.rentPerDay}</span>
                </div>
            `;

            card.addEventListener('click', () => this.handleRoomCardClick(room));
            container.appendChild(card);
        });
        lucide.createIcons();
    },

    handleRoomCardClick(room) {
        if (room.status === 'empty') {
            document.getElementById('checkin-room-id').value = room.id;
            document.getElementById('checkin-room-display').textContent = room.number;
            document.getElementById('checkin-rent').value = room.rentPerDay;
            document.getElementById('guest-name').value = '';
            document.getElementById('guest-phone').value = '';
            document.getElementById('checkin-days').value = '1';
            this.openModal('modal-check-in');
        } else {
            document.getElementById('checkout-room-id').value = room.id;
            document.getElementById('checkout-room-title').textContent = `Room ${room.number}`;
            document.getElementById('checkout-guest-name').textContent = room.currentGuest.name;
            document.getElementById('checkout-stay-days').textContent = room.currentGuest.days;
            document.getElementById('checkout-rent-rate').textContent = `₹${room.rentPerDay}`;
            document.getElementById('checkout-actual-days').value = room.currentGuest.days;

            this.updateCheckOutInvoice(room.currentGuest.days);
            this.openModal('modal-check-out');
        }
    },

    handleAddRoom() {
        const number = document.getElementById('room-number').value.trim();
        const type = document.getElementById('room-type').value;
        const rent = parseInt(document.getElementById('room-rent').value);

        if(!number || isNaN(rent)) return;

        // Check duplicates
        if (this.rooms.some(r => r.number === number)) {
            alert('A room with this number already exists.');
            return;
        }

        const newRoom = {
            id: 'room_' + Date.now(),
            number: number,
            type: type,
            rentPerDay: rent,
            status: 'empty',
            currentGuest: null
        };

        this.rooms.push(newRoom);
        this.logActivity('system', `New room <strong>${number}</strong> (${type}) added.`);
        this.saveAll();
        
        this.closeModal('modal-add-room');
        document.getElementById('form-add-room').reset();
        this.renderRooms();
    },

    handleCheckIn() {
        const roomId = document.getElementById('checkin-room-id').value;
        const name = document.getElementById('guest-name').value.trim();
        const phone = document.getElementById('guest-phone').value.trim();
        const rent = parseInt(document.getElementById('checkin-rent').value);
        const days = parseInt(document.getElementById('checkin-days').value);

        if (!name || isNaN(rent) || isNaN(days)) return;

        const roomIndex = this.rooms.findIndex(r => r.id === roomId);
        if (roomIndex === -1) return;

        this.rooms[roomIndex].status = 'occupied';
        this.rooms[roomIndex].rentPerDay = rent; // Allow override
        this.rooms[roomIndex].currentGuest = {
            name: name,
            phone: phone || 'N/A',
            days: days,
            checkInDate: new Date().toISOString().split('T')[0]
        };

        this.logActivity('checkin', `<strong>${name}</strong> checked into Room ${this.rooms[roomIndex].number} for ${days} days.`);
        this.saveAll();

        this.closeModal('modal-check-in');
        this.renderRooms();
    },

    updateCheckOutInvoice(daysStr) {
        const roomId = document.getElementById('checkout-room-id').value;
        const room = this.rooms.find(r => r.id === roomId);
        if (!room) return;

        const days = parseInt(daysStr) || room.currentGuest.days;
        const rentCost = days * room.rentPerDay;

        // Find active service records for this room
        const roomServices = this.services.filter(s => s.roomId === room.id && s.status === 'pending');
        const completedRoomServices = this.services.filter(s => s.roomId === room.id && s.status === 'completed');
        
        // Sum completed service charges (pending are services that need to be completed, but for checkout let's sum ALL active services attached to this room context)
        // Let's sum services associated with this room which haven't been archived yet.
        const activeRoomServices = this.services.filter(s => s.roomId === room.id);
        const serviceCostSum = activeRoomServices.reduce((acc, curr) => acc + curr.cost, 0);

        document.getElementById('bill-days-count').textContent = days;
        document.getElementById('bill-room-rent-cost').textContent = `₹${rentCost.toFixed(2)}`;
        document.getElementById('bill-services-cost').textContent = `₹${serviceCostSum.toFixed(2)}`;
        
        // Populate services breakdown list
        const sBreakdown = document.getElementById('checkout-services-breakdown');
        sBreakdown.innerHTML = '';
        if (activeRoomServices.length === 0) {
            sBreakdown.innerHTML = '<div class="mini-service-item"><span class="text-muted">No room service charges</span><span>₹0.00</span></div>';
        } else {
            activeRoomServices.forEach(s => {
                const div = document.createElement('div');
                div.className = 'mini-service-item';
                div.innerHTML = `
                    <span>${s.type} - ${s.desc}</span>
                    <span>₹${s.cost.toFixed(2)}</span>
                `;
                sBreakdown.appendChild(div);
            });
        }

        const grandTotal = rentCost + serviceCostSum;
        document.getElementById('bill-grand-total').textContent = `₹${grandTotal.toFixed(2)}`;
    },

    handleCheckOut() {
        const roomId = document.getElementById('checkout-room-id').value;
        const actualDays = parseInt(document.getElementById('checkout-actual-days').value);
        
        const roomIndex = this.rooms.findIndex(r => r.id === roomId);
        if(roomIndex === -1) return;

        const room = this.rooms[roomIndex];
        const days = isNaN(actualDays) ? room.currentGuest.days : actualDays;
        const rentCost = days * room.rentPerDay;

        const activeRoomServices = this.services.filter(s => s.roomId === room.id);
        const serviceCostSum = activeRoomServices.reduce((acc, curr) => acc + curr.cost, 0);
        const grandTotal = rentCost + serviceCostSum;

        // Record Rent Income
        this.incomes.push({
            id: 'inc_' + Date.now(),
            source: 'Room Rent',
            amount: rentCost,
            date: new Date().toISOString().split('T')[0],
            desc: `Room ${room.number} Check-out (${room.currentGuest.name})`
        });

        // Record Service Income if service cost > 0
        if(serviceCostSum > 0) {
            this.incomes.push({
                id: 'inc_srv_' + Date.now(),
                source: 'Room Service',
                amount: serviceCostSum,
                date: new Date().toISOString().split('T')[0],
                desc: `Room ${room.number} Service charges`
            });
        }

        // Delete/Archived room services linked to this check-out
        this.services = this.services.filter(s => s.roomId !== room.id);

        this.logActivity('checkout', `Room ${room.number} checked out by <strong>${room.currentGuest.name}</strong>. Collected ₹${grandTotal.toFixed(2)}.`);
        
        // Reset room
        this.rooms[roomIndex].status = 'empty';
        this.rooms[roomIndex].currentGuest = null;

        this.saveAll();
        this.closeModal('modal-check-out');
        this.renderRooms();
    },

    // 3. Room Services View
    renderServices() {
        const pendingContainer = document.getElementById('pending-services-container');
        const historyContainer = document.getElementById('history-services-container');

        const pending = this.services.filter(s => s.status === 'pending');
        const history = this.services.filter(s => s.status === 'completed');

        // Render Pending
        pendingContainer.innerHTML = '';
        if (pending.length === 0) {
            pendingContainer.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="check-circle-2" class="color-success"></i>
                    <p>All service requests completed!</p>
                </div>
            `;
        } else {
            pending.forEach(s => {
                const room = this.rooms.find(r => r.id === s.roomId);
                const roomNum = room ? room.number : 'Unknown';
                const card = document.createElement('div');
                card.className = 'service-card';
                
                card.innerHTML = `
                    <div class="service-meta">
                        <div class="service-cat-icon">
                            <i data-lucide="${this.getServiceIconName(s.type)}"></i>
                        </div>
                        <div class="service-details">
                            <span class="service-room-tag">Room ${roomNum}</span>
                            <span class="service-desc-text">${s.desc}</span>
                        </div>
                    </div>
                    <div class="service-action-area">
                        <span class="service-cost-tag">₹${s.cost}</span>
                        <button class="btn-complete-service" data-id="${s.id}">
                            <i data-lucide="check" style="width:14px;height:14px;"></i> Done
                        </button>
                    </div>
                `;
                
                card.querySelector('.btn-complete-service').addEventListener('click', (e) => {
                    this.completeService(s.id);
                });

                pendingContainer.appendChild(card);
            });
        }

        // Render History
        historyContainer.innerHTML = '';
        if(history.length === 0) {
            historyContainer.innerHTML = '<div class="empty-list-message">No service history yet.</div>';
        } else {
            // Display last 10 completed services
            history.slice(-10).reverse().forEach(s => {
                const room = this.rooms.find(r => r.id === s.roomId);
                const roomNum = room ? room.number : 'Unknown';
                const card = document.createElement('div');
                card.className = 'service-card';
                card.style.opacity = '0.8';
                
                card.innerHTML = `
                    <div class="service-meta">
                        <div class="service-cat-icon" style="background-color: var(--neutral-100); color: var(--neutral-500);">
                            <i data-lucide="${this.getServiceIconName(s.type)}"></i>
                        </div>
                        <div class="service-details">
                            <span class="service-room-tag">Room ${roomNum}</span>
                            <span class="service-desc-text">${s.desc}</span>
                        </div>
                    </div>
                    <div class="service-action-area">
                        <span class="service-cost-tag">₹${s.cost}</span>
                        <span class="service-status-completed">
                            <i data-lucide="check-circle" style="width:12px;height:12px;"></i> Completed
                        </span>
                    </div>
                `;
                historyContainer.appendChild(card);
            });
        }
        lucide.createIcons();
    },

    getServiceIconName(type) {
        if(type === 'Food') return 'soup';
        if(type === 'Laundry') return 'shirt';
        if(type === 'Cleaning') return 'brush';
        if(type === 'Maintenance') return 'wrench';
        return 'wrench';
    },

    populateServiceRoomSelect() {
        const select = document.getElementById('service-room-id');
        select.innerHTML = '';

        const occupiedRooms = this.rooms.filter(r => r.status === 'occupied');
        if (occupiedRooms.length === 0) {
            select.innerHTML = '<option value="" disabled selected>No occupied rooms currently</option>';
            return;
        }

        occupiedRooms.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = `Room ${r.number} - ${r.currentGuest.name}`;
            select.appendChild(opt);
        });
    },

    handleAddService() {
        const roomId = document.getElementById('service-room-id').value;
        const type = document.getElementById('service-type').value;
        const desc = document.getElementById('service-desc').value.trim();
        const cost = parseInt(document.getElementById('service-cost').value);

        if (!roomId || !desc || isNaN(cost)) return;

        const room = this.rooms.find(r => r.id === roomId);
        if(!room) return;

        const newService = {
            id: 'srv_' + Date.now(),
            roomId: roomId,
            type: type,
            desc: desc,
            cost: cost,
            status: 'pending',
            timestamp: new Date().toISOString()
        };

        this.services.push(newService);
        this.logActivity('service', `Service (<strong>${type}</strong>) requested for Room ${room.number} - ₹${cost}.`);
        this.saveAll();

        this.closeModal('modal-add-service');
        document.getElementById('form-add-service').reset();
        this.renderServices();
    },

    completeService(srvId) {
        const srvIndex = this.services.findIndex(s => s.id === srvId);
        if (srvIndex === -1) return;

        this.services[srvIndex].status = 'completed';
        const room = this.rooms.find(r => r.id === this.services[srvIndex].roomId);
        const roomNum = room ? room.number : 'Unknown';

        this.logActivity('service', `Service for Room ${roomNum} completed: <strong>${this.services[srvIndex].desc}</strong>.`);
        this.saveAll();
        this.renderServices();
    },

    // 4. Expenses & Ledger View
    renderExpenses() {
        const ledgerBody = document.getElementById('expense-ledger-tbody');
        ledgerBody.innerHTML = '';

        let staffSum = 0;
        let otherSum = 0;

        if (this.expenses.length === 0) {
            ledgerBody.innerHTML = '<tr><td colspan="4" class="empty-list-message">No expenses logged yet.</td></tr>';
        } else {
            // Sort by date descending
            const sorted = [...this.expenses].reverse();
            sorted.forEach(exp => {
                const tr = document.createElement('tr');
                
                if (exp.category === 'Staff Salary') staffSum += exp.amount;
                else otherSum += exp.amount;

                tr.innerHTML = `
                    <td>
                        <span class="ledger-desc">${exp.title}</span>
                        <span class="ledger-date">${exp.date}</span>
                    </td>
                    <td><span class="badge ${exp.category === 'Staff Salary' ? 'bg-danger-light color-danger' : 'bg-warning-light color-warning'}">${exp.category}</span></td>
                    <td class="text-danger font-weight-bold">-₹${exp.amount.toFixed(2)}</td>
                    <td>
                        <button class="btn-delete-ledger" data-id="${exp.id}" title="Remove Expense">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </td>
                `;

                tr.querySelector('.btn-delete-ledger').addEventListener('click', () => {
                    this.handleDeleteExpense(exp.id);
                });

                ledgerBody.appendChild(tr);
            });
        }

        document.getElementById('exp-total-staff').textContent = `₹${staffSum.toFixed(0)}`;
        document.getElementById('exp-total-other').textContent = `₹${otherSum.toFixed(0)}`;
        lucide.createIcons();
    },

    handleAddExpense() {
        const title = document.getElementById('expense-title').value.trim();
        const category = document.getElementById('expense-category').value;
        const amount = parseFloat(document.getElementById('expense-amount').value);

        if(!title || isNaN(amount) || amount <= 0) return;

        const newExp = {
            id: 'exp_' + Date.now(),
            title: title,
            category: category,
            amount: amount,
            date: new Date().toISOString().split('T')[0]
        };

        this.expenses.push(newExp);
        this.logActivity('expense', `Logged expense: <strong>${title}</strong> (-₹${amount}).`);
        this.saveAll();

        this.closeModal('modal-add-expense');
        document.getElementById('form-add-expense').reset();
        this.renderExpenses();
    },

    handleDeleteExpense(id) {
        if(!confirm('Are you sure you want to remove this expense entry?')) return;
        if(!confirm('Double Verification: Are you absolutely sure? This cannot be undone.')) return;
        
        const exp = this.expenses.find(e => e.id === id);
        const title = exp ? exp.title : 'Expense';

        this.expenses = this.expenses.filter(e => e.id !== id);
        this.logActivity('system', `Deleted expense log: <strong>${title}</strong>.`);
        this.saveAll();
        this.renderExpenses();
    },

    // 5. Analytics View
    renderAnalytics() {
        const total = this.rooms.length;
        const occupied = this.rooms.filter(r => r.status === 'occupied').length;
        const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

        // Progress bar fill
        document.getElementById('occupancy-fill').style.width = `${rate}%`;
        document.getElementById('occupancy-percentage').textContent = `${rate}% Occupancy`;
        document.getElementById('occupancy-fraction').textContent = `${occupied} / ${total} Rooms Filled`;

        // Financial category tallies
        const rentInc = this.incomes.filter(i => i.source === 'Room Rent').reduce((acc, curr) => acc + curr.amount, 0);
        const serviceInc = this.incomes.filter(i => i.source === 'Room Service').reduce((acc, curr) => acc + curr.amount, 0);
        
        const staffExp = this.expenses.filter(e => e.category === 'Staff Salary').reduce((acc, curr) => acc + curr.amount, 0);
        const otherExp = this.expenses.filter(e => e.category !== 'Staff Salary').reduce((acc, curr) => acc + curr.amount, 0);

        document.getElementById('anal-rent-inc').textContent = `₹${rentInc.toFixed(2)}`;
        document.getElementById('anal-service-inc').textContent = `₹${serviceInc.toFixed(2)}`;
        document.getElementById('anal-staff-exp').textContent = `₹${staffExp.toFixed(2)}`;
        document.getElementById('anal-other-exp').textContent = `₹${otherExp.toFixed(2)}`;

        // Render bar charts proportional to the maximum value among all 4 tallies
        const maxVal = Math.max(rentInc, serviceInc, staffExp, otherExp, 1); // Avoid division by zero

        document.getElementById('anal-rent-bar').style.width = `${(rentInc / maxVal) * 100}%`;
        document.getElementById('anal-service-bar').style.width = `${(serviceInc / maxVal) * 100}%`;
        document.getElementById('anal-staff-bar').style.width = `${(staffExp / maxVal) * 100}%`;
        document.getElementById('anal-other-bar').style.width = `${(otherExp / maxVal) * 100}%`;
    },

    // 6. Interactive Calculator
    handleCalcInput(val, action) {
        const historyView = document.getElementById('calc-history-view');
        const displayView = document.getElementById('calc-display-view');
        const saveBtn = document.getElementById('btn-calc-save-expense');

        if (action === 'clear') {
            this.calcState.expression = '';
            this.calcState.result = null;
            displayView.textContent = '0';
            historyView.textContent = '';
            saveBtn.disabled = true;
        } 
        else if (action === 'backspace') {
            if(this.calcState.expression.length > 0) {
                this.calcState.expression = this.calcState.expression.slice(0, -1);
                displayView.textContent = this.calcState.expression || '0';
            }
        } 
        else if (action === 'calculate') {
            const expr = this.calcState.expression;
            if(!expr) return;

            try {
                // Safe evaluation: sanitize string to only allow math tokens: digits, +, -, *, /, .
                const sanitizedExpr = expr.replace(/[^0-9+\-*/.]/g, '');
                
                // Use Function instead of eval for cleaner context
                const res = new Function(`return ${sanitizedExpr}`)();
                
                if (res !== undefined && !isNaN(res) && isFinite(res)) {
                    this.calcState.result = parseFloat(res.toFixed(2));
                    historyView.textContent = expr + ' =';
                    displayView.textContent = this.calcState.result;
                    this.calcState.expression = String(this.calcState.result);
                    saveBtn.disabled = false; // Enable "save to expense" button
                } else {
                    displayView.textContent = 'Error';
                    saveBtn.disabled = true;
                }
            } catch (err) {
                displayView.textContent = 'Error';
                saveBtn.disabled = true;
            }
        } 
        else if (val) {
            // Prevent consecutive operators
            const operators = ['+', '-', '*', '/'];
            const lastChar = this.calcState.expression.slice(-1);
            if (operators.includes(val) && operators.includes(lastChar)) {
                // Replace last operator with new one
                this.calcState.expression = this.calcState.expression.slice(0, -1) + val;
            } else {
                this.calcState.expression += val;
            }
            displayView.textContent = this.calcState.expression;
        }
    }
};

// Initialize App on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
