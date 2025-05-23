// Global variables
let video;
let canvas;
let isModelLoaded = false;
let isDetecting = false;
let detectionInterval;
let lastAccessTime = {};
let lastDetectedFace = null;
let lastDetectedUser = null;
let isAdminMode = false;
let progressModal;
let attendanceDetailsModal;
let todayAttendance = new Set();
let currentUserId = null;

// Initialize face-api.js models
async function loadModels() {
    try {
        console.log('Loading face detection models...');
        
        // Wait for face-api to be loaded
        if (typeof faceapi === 'undefined') {
            throw new Error('face-api.js is not loaded');
        }
        
        const MODEL_URL = '../models';
        
        // Load models with proper error handling
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        isModelLoaded = true;
        console.log('All face detection models loaded successfully');
        
        document.getElementById('startBtn').disabled = false;
    } catch (error) {
        console.error('Error loading models:', error);
        showAlert('Error loading face detection models. Please check the console for details.', 'danger');
    }
}

// Initialize video stream
async function initVideo() {
    try {
        video = document.getElementById('video');
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        });
        video.srcObject = stream;

        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.width = video.videoWidth;
                video.height = video.videoHeight;
                resolve();
            };
        });
    } catch (error) {
        console.error('Error accessing camera:', error);
        showAlert('Error accessing camera. Please ensure you have granted camera permissions.', 'danger');
    }
}

// Start face detection
async function startDetection() {
    if (!isModelLoaded || isDetecting) return;
    
    isDetecting = true;
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'inline-block';
    
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    
    // Create canvas for detection overlay
    const detectionCanvas = document.createElement('canvas');
    detectionCanvas.width = displaySize.width;
    detectionCanvas.height = displaySize.height;
    const ctx = detectionCanvas.getContext('2d');
    
    // Position canvas over video
    detectionCanvas.style.position = 'absolute';
    detectionCanvas.style.top = '0';
    detectionCanvas.style.left = '0';
    video.parentElement.appendChild(detectionCanvas);
    
    // Start detection loop
    detectionInterval = setInterval(async () => {
        if (!isDetecting) return;
        
        try {
            const detections = await faceapi.detectAllFaces(video)
                .withFaceLandmarks()
                .withFaceDescriptors();
            
            // Clear canvas
            ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
            
            if (detections.length > 0) {
                // Draw detections
                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                faceapi.draw.drawDetections(detectionCanvas, resizedDetections);
                faceapi.draw.drawFaceLandmarks(detectionCanvas, resizedDetections);
                
                // Process each detected face
                for (const detection of detections) {
                    const userInfo = await processFace(detection.descriptor);
                    if (userInfo) {
                        const name = `${userInfo.firstName} ${userInfo.lastName}`;
                        const box = resizedDetections[0].detection.box;
                        
                        // Draw name label
                        ctx.font = '16px Arial';
                        ctx.fillStyle = '#00ff00';
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 3;
                        
                        const textWidth = ctx.measureText(name).width;
                        const textX = box.x + (box.width - textWidth) / 2;
                        const textY = box.y - 10;
                        
                        ctx.strokeText(name, textX, textY);
                        ctx.fillText(name, textX, textY);
                    }
                }
            }
        } catch (error) {
            console.error('Error in face detection:', error);
        }
    }, 1000); // Check every second
}

// Stop face detection
function stopDetection() {
    isDetecting = false;
    clearInterval(detectionInterval);
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
    
    // Remove detection canvas
    const canvas = video.parentElement.querySelector('canvas');
    if (canvas) {
        canvas.remove();
    }
}

// Process detected face
async function processFace(descriptor) {
    try {
        const response = await fetch('http://localhost:5555/api/verify-face', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                faceDescriptor: Array.from(descriptor)
            })
        });

        const data = await response.json();
        console.log('API Response:', data);

        if (response.ok && data.user) {
            const user = data.user;
            currentUserId = user._id;
            
            // Check if enough time has passed since last access
            const now = Date.now();
            const lastAccess = lastAccessTime[user._id] || 0;
            
            if (now - lastAccess > 5000) { // 5 seconds cooldown
                lastAccessTime[user._id] = now;
                
                // Mark attendance
                await markAttendance(user);
                
                // Update status
                updateStatus(`Attendance marked for ${user.firstName} ${user.lastName}`, 'success');
            }
            
            return user;
        }
        return null;
    } catch (error) {
        console.error('Error verifying face:', error);
        return null;
    }
}

// Mark attendance
async function markAttendance(user) {
    try {
        console.log('Marking attendance for user:', user);
        
        const response = await fetch('http://localhost:5555/api/mark-attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: user._id,
                timestamp: new Date().toISOString()
            })
        });

        const data = await response.json();
        console.log('Attendance response:', data);
        
        if (response.ok && data.success) {
            // Check if attendance was already marked
            if (data.message && data.message.includes('already marked')) {
                if (data.existingAttendance && data.user) {
                    const attendanceList = document.getElementById('attendanceList');
            
                    // Remove previous entries
                    attendanceList.innerHTML = '';
            
                    // Format and add new
                    const existingTime = data.existingAttendance.time;
                    const existingDate = new Date(data.existingAttendance.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
            
                    const attendanceItem = document.createElement('div');
                    attendanceItem.className = 'card mb-2 user-card';
                    attendanceItem.setAttribute('data-user-id', user._id);
                    attendanceItem.innerHTML = `
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <div class="flex-shrink-0">
                                    ${data.user.image ? 
                                        `<img src="${data.user.image}" alt="User" class="rounded-circle" style="width: 60px; height: 60px; object-fit: cover; border: 2px solid #4A90E2;">` :
                                        '<i class="fas fa-user-circle fa-3x text-secondary"></i>'
                                    }
                                </div>
                                <div class="flex-grow-1 ms-3">
                                    <h6 class="mb-1">${data.user.firstName} ${data.user.lastName}</h6>
                                    <p class="mb-0 text-muted">
                                        <small>
                                            <i class="fas fa-clock me-1"></i>${existingTime}
                                            <br>
                                            <i class="fas fa-calendar me-1"></i>${existingDate}
                                        </small>
                                    </p>
                                </div>
                                <div class="flex-shrink-0">
                                    <span class="badge bg-success">
                                        <i class="fas fa-check-circle me-1"></i>Present
                                    </span>
                                </div>
                            </div>
                        </div>
                    `;
                    attendanceList.appendChild(attendanceItem);
                }
                showAlert('You have already marked your attendance today', 'info');
                return;
            }
            
            
            // Add to today's attendance list if not already present
            if (!todayAttendance.has(user._id)) {
                todayAttendance.add(user._id);
                addAttendanceToList(user);
                showAlert(`Attendance marked for ${user.firstName} ${user.lastName}`, 'success');
            }
        } else {
            showAlert(data.error || 'Error marking attendance', 'warning');
        }
    } catch (error) {
        console.error('Error marking attendance:', error);
        showAlert('Error marking attendance. Please try again.', 'danger');
    }
}

function addAttendanceToList(user, attendance = null) {
    const attendanceList = document.getElementById('attendanceList');

    // 🧹 Clear previous entries (only keep the latest one)
    attendanceList.innerHTML = '';

    // Format current date and time
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const formattedDate = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const attendanceItem = document.createElement('div');
    attendanceItem.className = 'card mb-2 user-card';
    attendanceItem.setAttribute('data-user-id', user._id);
    attendanceItem.innerHTML = `
        <div class="card-body">
            <div class="d-flex align-items-center">
                <div class="flex-shrink-0">
                    ${user.image ? 
                        `<img src="${user.image}" alt="User" class="rounded-circle" style="width: 60px; height: 60px; object-fit: cover; border: 2px solid #4A90E2;">` :
                        '<i class="fas fa-user-circle fa-3x text-secondary"></i>'
                    }
                </div>
                <div class="flex-grow-1 ms-3">
                    <h6 class="mb-1">${user.firstName} ${user.lastName}</h6>
                    <p class="mb-0 text-muted">
                        <small>
                            <i class="fas fa-clock me-1"></i>${formattedTime}
                            <br>
                            <i class="fas fa-calendar me-1"></i>${formattedDate}
                        </small>
                    </p>
                </div>
                <div class="flex-shrink-0">
                    <span class="badge bg-success">
                        <i class="fas fa-check-circle me-1"></i>Present
                    </span>
                </div>
            </div>
        </div>
    `;

    attendanceList.appendChild(attendanceItem);
}


// Toggle admin mode
function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    const adminControls = document.getElementById('adminControls');
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    
    if (isAdminMode) {
        adminControls.style.display = 'block';
        modeToggleBtn.innerHTML = '<i class="fas fa-user"></i> Switch to Attendance Mode';
        modeToggleBtn.className = 'btn btn-success';
        updateStatus('Admin Mode: You can check and export attendance records', 'info');
    } else {
        adminControls.style.display = 'none';
        modeToggleBtn.innerHTML = '<i class="fas fa-user-shield"></i> Switch to Admin Mode';
        modeToggleBtn.className = 'btn btn-primary';
        updateStatus('Attendance Mode: Ready to mark attendance', 'secondary');
    }
}

// Check attendance
async function checkAttendance() {
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    
    if (!fromDate || !toDate) {
        showAlert('Please select both from and to dates', 'warning');
        return;
    }
    
    try {
        showProgress('Fetching attendance records...');
        
        const url = new URL('http://localhost:5555/api/attendance');
        url.searchParams.append('from', fromDate);
        url.searchParams.append('to', toDate);
        if (currentUserId) {
            url.searchParams.append('userId', currentUserId);
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('Attendance records:', data);
        
        if (response.ok && data.success) {
            hideProgress();
            
            if (data.records.length === 0) {
                const formattedFromDate = new Date(fromDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const formattedToDate = new Date(toDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                
                const modal = document.getElementById('attendanceDetailsModal');
                const content = document.getElementById('attendanceDetailsContent');
                
                if (modal && content) {
                    content.innerHTML = `
                        <div class="alert alert-info">
                            <h5 class="alert-heading">No Attendance Records Found</h5>
                            <p>There are no attendance records for the period:</p>
                            <p class="mb-0"><strong>From:</strong> ${formattedFromDate}</p>
                            <p class="mb-0"><strong>To:</strong> ${formattedToDate}</p>
                        </div>
                    `;
                    
                    const bsModal = new bootstrap.Modal(modal);
                    bsModal.show();
                } else {
                    showAlert(`No attendance records found for the period ${formattedFromDate} to ${formattedToDate}`, 'info');
                }
            } else {
                showAttendanceDetails(data.records);
            }
        } else {
            hideProgress();
            showAlert(data.error || 'Error fetching attendance records', 'danger');
        }
    } catch (error) {
        console.error('Error checking attendance:', error);
        hideProgress();
        showAlert('Error checking attendance. Please try again.', 'danger');
    }
}

// Export records
async function exportRecords() {
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    
    if (!fromDate || !toDate) {
        showAlert('Please select both from and to dates', 'warning');
        return;
    }
    
    try {
        showProgress('Generating report...');
        
        // Add userId to the query if available
        const apiUrl = new URL('http://localhost:5555/api/export-attendance');
        apiUrl.searchParams.append('from', fromDate);
        apiUrl.searchParams.append('to', toDate);
        if (currentUserId) {
            apiUrl.searchParams.append('userId', currentUserId);
        }
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate report');
        }
        
        const blob = await response.blob();
        hideProgress();
        
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `face_detection_attendance_report_${fromDate}_to_${toDate}${currentUserId ? '_user' : ''}.pdf`;
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
        
        showAlert('Report exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting records:', error);
        hideProgress();
        showAlert(error.message || 'Error exporting records. Please try again.', 'danger');
    }
}

// Show attendance details
function showAttendanceDetails(records) {
    const content = document.getElementById('attendanceDetailsContent');
    if (!content) {
        console.error('Attendance details content element not found');
        return;
    }
    
    content.innerHTML = '';
    
    // Add date range header
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    const formattedFromDate = new Date(fromDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedToDate = new Date(toDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const dateRangeHeader = document.createElement('div');
    dateRangeHeader.className = 'alert alert-info mb-4';
    dateRangeHeader.innerHTML = `
        <h5 class="mb-0">Showing attendance from ${formattedFromDate} to ${formattedToDate}</h5>
        <p class="mb-0 mt-2">Total Records: ${records.length}</p>
    `;
    content.appendChild(dateRangeHeader);
    
    // Group records by date
    const groupedRecords = records.reduce((acc, record) => {
        const date = record.date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(record);
        return acc;
    }, {});
    
    // Create content
    for (const [date, dayRecords] of Object.entries(groupedRecords)) {
        const dateSection = document.createElement('div');
        dateSection.className = 'mb-4';
        
        // Create header with date
        const header = document.createElement('h5');
        header.className = 'border-bottom pb-2';
        header.textContent = date;
        dateSection.appendChild(header);
        
        // Create table
        const table = document.createElement('div');
        table.className = 'table-responsive';
        table.innerHTML = `
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Time</th>
                        <th>Role</th>
                        <th>Profile</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${dayRecords.map(record => {
                        // Skip records with missing user data
                        if (!record.user) {
                            console.warn('Skipping record with missing user data:', record);
                            return '';
                        }
                        
                        const userName = record.user.firstName && record.user.lastName ? 
                            `${record.user.firstName} ${record.user.lastName}` : 
                            'Unknown User';
                            
                        const userEmail = record.user.email || 'N/A';
                        const userPhone = record.user.phoneNumber || 'N/A';
                        const userRole = record.user.role || 'N/A';
                        
                        return `
                            <tr>
                                <td>${userName}</td>
                                <td>${userEmail}</td>
                                <td>${userPhone}</td>
                                <td>${record.time || 'N/A'}</td>
                                <td><span class="badge bg-${userRole === 'admin' ? 'danger' : 'primary'}">${userRole}</span></td>
                                <td>
                                    ${record.user.image ? 
                                        `<img src="${record.user.image}" alt="Profile" class="rounded-circle" style="width: 40px; height: 40px; object-fit: cover;">` :
                                        '<i class="fas fa-user-circle fa-2x"></i>'
                                    }
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-info" onclick="showUserDetails('${record.user._id}', '${record.user.username || 'Unknown'}')">
                                        <i class="fas fa-info-circle"></i> Details
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        dateSection.appendChild(table);
        content.appendChild(dateSection);
    }
    
    // Show modal
    const modal = document.getElementById('attendanceDetailsModal');
    if (modal) {
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    } else {
        console.error('Attendance details modal not found');
    }
}

// Show user details
async function showUserDetails(userId, username) {
    try {
        const response = await fetch(`http://localhost:5555/api/user/${userId}/attendance-history`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch user details');
        }
        
        const user = data.user;
        const history = data.history;
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">User Details - ${username}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="row mb-4">
                    <div class="col-md-6">
                        <h6 class="border-bottom pb-2">User Information</h6>
                        <table class="table table-sm">
                            <tr><td>Username:</td><td>${user.username}</td></tr>
                            <tr><td>Age:</td><td>${user.age || 'N/A'}</td></tr>
                            <tr><td>Gender:</td><td>${user.gender || 'N/A'}</td></tr>
                            <tr><td>Status:</td><td><span class="badge bg-success">Active</span></td></tr>
                            <tr><td>Created At:</td><td>${new Date(user.createdAt).toLocaleString()}</td></tr>
                            <tr><td>Updated At:</td><td>${new Date(user.updatedAt).toLocaleString()}</td></tr>
                        </table>
                    </div>
                    <div class="col-md-6">
                        <h6 class="border-bottom pb-2">Activity Information</h6>
                        <table class="table table-sm">
                            <tr><td>Last Seen:</td><td>${new Date(user.lastSeen).toLocaleString()}</td></tr>
                            <tr><td>Last Detected:</td><td>${new Date(user.lastDetected).toLocaleString()}</td></tr>
                            <tr><td>Today's Attendance:</td><td>${history.todayCount}</td></tr>
                            <tr><td>Total Attendance:</td><td>${history.totalCount}</td></tr>
                            <tr><td>First Detection:</td><td>${new Date(history.firstDetection).toLocaleString()}</td></tr>
                            <tr><td>Last 7 Days:</td><td>${history.last7DaysCount}</td></tr>
                        </table>
                    </div>
                </div>
                
                <h6 class="border-bottom pb-2">Attendance History</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${history.records.map(record => `
                                <tr>
                                    <td>${new Date(record.date).toLocaleDateString()}</td>
                                    <td>${record.time}</td>
                                    <td><span class="badge bg-success">Present</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        // Create and show modal
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'userDetailsModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    ${modalContent.innerHTML}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // Clean up modal after it's hidden
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        showAlert('Error fetching user details. Please try again.', 'danger');
    }
}

// Show progress
function showProgress(message) {
    if (!progressModal) {
        progressModal = new bootstrap.Modal(document.getElementById('progressModal'));
    }
    document.getElementById('progressText').textContent = message;
    progressModal.show();
}

// Hide progress
function hideProgress() {
    if (progressModal) {
        progressModal.hide();
        // Reset progress text
        document.getElementById('progressText').textContent = '';
        // Reset progress bar
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.style.width = '0%';
        }
    }
}

// Update status
function updateStatus(message, type = 'secondary') {
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.textContent = message;
    statusBadge.className = `badge bg-${type}`;
}

// Show alert
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show mt-2`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Get or create the alert container at the bottom
    let alertContainer = document.getElementById('attendanceAlert');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'attendanceAlert';
        alertContainer.style.position = 'fixed';
        alertContainer.style.bottom = '20px';
        alertContainer.style.left = '50%';
        alertContainer.style.transform = 'translateX(-50%)';
        alertContainer.style.zIndex = '9999';
        alertContainer.style.width = 'auto';
        alertContainer.style.maxWidth = '80%';
        document.body.appendChild(alertContainer);
    }

    // Add the alert to the container
    alertContainer.appendChild(alertDiv);

    // Automatically remove after 5 seconds
    setTimeout(() => {
        alertDiv.classList.remove('show');
        alertDiv.classList.add('hide');
        setTimeout(() => {
            alertDiv.remove();
            // If this was the last alert in the container, remove the container too
            if (alertContainer && alertContainer.children.length === 0) {
                alertContainer.remove();
            }
        }, 500);
    }, 5000);
}


// Initialize application
async function init() {
    try {
        await loadModels();
        await initVideo();

        // Initialize modals
        progressModal = new bootstrap.Modal(document.getElementById('progressModal'));
        attendanceDetailsModal = new bootstrap.Modal(document.getElementById('attendanceDetailsModal'));

        // Set default dates
        const today = new Date();
        const twentyDaysAgo = new Date(today);
        twentyDaysAgo.setDate(today.getDate() - 20);
        
        document.getElementById('fromDate').value = twentyDaysAgo.toISOString().split('T')[0];
        document.getElementById('toDate').value = today.toISOString().split('T')[0];

        // Event listeners
        document.getElementById('startBtn').addEventListener('click', startDetection);
        document.getElementById('stopBtn').addEventListener('click', stopDetection);
        document.getElementById('modeToggleBtn').addEventListener('click', toggleAdminMode);
        document.getElementById('checkAttendanceBtn').addEventListener('click', checkAttendance);
        document.getElementById('exportRecordsBtn').addEventListener('click', exportRecords);
        document.getElementById('updateDatesBtn').addEventListener('click', () => {
            const fromDate = document.getElementById('fromDate').value;
            const toDate = document.getElementById('toDate').value;
            if (fromDate && toDate) {
                showAlert('Date range updated successfully', 'success');
            } else {
                showAlert('Please select both from and to dates', 'warning');
            }
        });
    } catch (error) {
        console.error('Initialization error:', error);
        showAlert('Error initializing the application. Please refresh the page.', 'danger');
    }
}

// Start the application when the page loads
window.addEventListener('load', init); 