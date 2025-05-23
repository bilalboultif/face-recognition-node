// Global variables
let video;
let canvas;
let isModelLoaded = false;
let isDetecting = false;
let detectionInterval;
let lastAccessTime = {};
let lastDetectedFace = null;
let lastDetectedUser = null;
let detectedFaceModal;
let userDetailsModal;
let isLogVisible = false;
let logEntries = [];
const LOGS_PER_PAGE = 10;
let currentPage = 1;

// Show alert message
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.card-body').insertBefore(alertDiv, document.querySelector('.row'));
    setTimeout(() => alertDiv.remove(), 5000);
}

// Toggle log visibility
function toggleLog() {
    const logContainer = document.getElementById('logContainer');
    const paginationControls = document.getElementById('paginationControls');
    
    isLogVisible = !isLogVisible;
    logContainer.style.display = isLogVisible ? 'block' : 'none';
    paginationControls.style.display = isLogVisible ? 'flex' : 'none';
    
    if (isLogVisible) {
        updateLogDisplay();
    }
}

// Update log display with pagination
function updateLogDisplay() {
    const logContainer = document.getElementById('logContainer');
    const paginationControls = document.getElementById('paginationControls');
    
    // Clear current display
    logContainer.innerHTML = '';
    
    // Calculate pagination
    const totalPages = Math.ceil(logEntries.length / LOGS_PER_PAGE);
    const startIndex = (currentPage - 1) * LOGS_PER_PAGE;
    const endIndex = Math.min(startIndex + LOGS_PER_PAGE, logEntries.length);
    
    // Display current page entries
    for (let i = startIndex; i < endIndex; i++) {
        const entry = logEntries[i];
        const logEntry = document.createElement('div');
        logEntry.className = `logEntry ${entry.type}`;
        logEntry.innerHTML = `
            <span class="logTimestamp">${entry.timestamp}</span>
            ${entry.message}
        `;
        logContainer.appendChild(logEntry);
    }
    
    // Update pagination controls
    paginationControls.innerHTML = '';
    
    if (totalPages > 1) {
        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pageBtn';
        prevBtn.textContent = '←';
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                updateLogDisplay();
            }
        };
        paginationControls.appendChild(prevBtn);
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `pageBtn ${i === currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                currentPage = i;
                updateLogDisplay();
            };
            paginationControls.appendChild(pageBtn);
        }
        
        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pageBtn';
        nextBtn.textContent = '→';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                updateLogDisplay();
            }
        };
        paginationControls.appendChild(nextBtn);
    }
}

// Add log entry
function addLogEntry(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    logEntries.unshift({
        timestamp,
        message,
        type
    });
    
    // Keep only last 100 entries
    if (logEntries.length > 100) {
        logEntries = logEntries.slice(0, 100);
    }
    
    if (isLogVisible) {
        updateLogDisplay();
    }
}

// Add access log entry
function addAccessLog(user, success) {
    const time = new Date().toLocaleTimeString();
    let message;
    let type;
    
    if (success) {
        message = `Access Granted - User: ${user.username} - Name: ${user.firstName} ${user.lastName}`;
        type = 'success';
    } else {
        message = 'Access Denied - Unknown face detected';
        type = 'error';
    }
    
    addLogEntry(message, type);
}

// Initialize face-api.js models
async function loadModels() {
    try {
        console.log('Loading face detection models...');
        
        const MODEL_URL = './models';
        
        console.log('Loading SSD MobileNet model...');
        await faceapi.nets.ssdMobilenetv1.load(MODEL_URL);
        console.log('SSD MobileNet model loaded successfully');

        console.log('Loading Face Landmark model...');
        await faceapi.nets.faceLandmark68Net.load(MODEL_URL);
        console.log('Face Landmark model loaded successfully');

        console.log('Loading Face Recognition model...');
        await faceapi.nets.faceRecognitionNet.load(MODEL_URL);
        console.log('Face Recognition model loaded successfully');
        
        isModelLoaded = true;
        console.log('All face detection models loaded successfully');
        
        // Enable the start button once models are loaded
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
                
                // Store the last detected face
                lastDetectedFace = detections[0];
                
                // Enable face detected button
                document.getElementById('faceDetectedBtn').disabled = false;
                
                // Process each detected face
                for (let i = 0; i < detections.length; i++) {
                    const detection = detections[i];
                    const box = resizedDetections[i].detection.box;
                    
                    // Draw name label above face box
                    ctx.font = '16px Arial';
                    ctx.fillStyle = '#00ff00';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 3;
                    
                    // Get user info for this face
                    const userInfo = await processFace(detection.descriptor);
                    const name = userInfo ? `${userInfo.firstName} ${userInfo.lastName}` : 'Unknown';
                    
                    // Draw text with outline
                    const textWidth = ctx.measureText(name).width;
                    const textX = box.x + (box.width - textWidth) / 2;
                    const textY = box.y - 10;
                    
                    // Draw text outline
                    ctx.strokeText(name, textX, textY);
                    // Draw text
                    ctx.fillText(name, textX, textY);
                }
            } else {
                // No face detected
                lastDetectedFace = null;
                lastDetectedUser = null;
                document.getElementById('faceDetectedBtn').disabled = true;
                document.getElementById('statusAccessBtn').disabled = true;
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
    document.getElementById('faceDetectedBtn').disabled = true;
    document.getElementById('statusAccessBtn').disabled = true;
    
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
            // Store the complete user data
            lastDetectedUser = data.user;
            console.log('Stored User Data:', lastDetectedUser);

            document.getElementById('statusAccessBtn').disabled = false;
            document.getElementById('statusAccessBtn').textContent = 'Access Granted';
            document.getElementById('statusAccessBtn').className = 'btn btn-success';
            
            // Check if enough time has passed since last access
            const now = Date.now();
            const lastAccess = lastAccessTime[lastDetectedUser._id] || 0;
            if (now - lastAccess > 5000) { // 5 seconds cooldown
                lastAccessTime[lastDetectedUser._id] = now;
                addAccessLog(lastDetectedUser, true);
            }
            
            return lastDetectedUser;
        } else {
            lastDetectedUser = null;
            document.getElementById('statusAccessBtn').disabled = false;
            document.getElementById('statusAccessBtn').textContent = 'Access Denied';
            document.getElementById('statusAccessBtn').className = 'btn btn-danger';
            addAccessLog(null, false);
            return null;
        }
    } catch (error) {
        console.error('Error verifying face:', error);
        return null;
    }
}

// Fetch complete user details
async function fetchUserDetails(userId) {
    try {
        const response = await fetch(`http://localhost:5555/api/users/${userId}`);
        const data = await response.json();
        
        if (response.ok && data.user) {
            return data.user;
        }
        return null;
    } catch (error) {
        console.error('Error fetching user details:', error);
        return null;
    }
}

// Show user details
function showUserDetails() {
    if (!lastDetectedUser) {
        console.log('No user data available');
        return;
    }

    console.log('Showing details for user:', lastDetectedUser);

    const userDetailsContent = document.getElementById('userDetailsContent');
    
    // Format dates
    const formatDate = (dateString) => {
        if (!dateString) return 'Not available';
        try {
            const date = new Date(dateString);
            return date instanceof Date && !isNaN(date) ? date.toLocaleString() : 'Invalid Date';
        } catch (e) {
            console.error('Date formatting error:', e);
            return 'Invalid Date';
        }
    };

    userDetailsContent.innerHTML = `
        <div class="card">
            <div class="card-body">
                <div class="text-center mb-4">
                    <img src="${lastDetectedUser.image || ''}" alt="User Image" class="rounded-circle mb-3" style="width: 150px; height: 150px; object-fit: cover;">
                    <h4 class="card-title">${lastDetectedUser.firstName || ''} ${lastDetectedUser.lastName || ''}</h4>
                    <span class="badge ${lastDetectedUser.status === 'online' ? 'bg-success' : 'bg-secondary'}">${lastDetectedUser.status || 'offline'}</span>
                </div>
                
                <div class="row">
                    <div class="col-md-6">
                        <h5 class="border-bottom pb-2">Personal Information</h5>
                        <p><strong>Username:</strong> ${lastDetectedUser.username || 'Not available'}</p>
                        <p><strong>Email:</strong> ${lastDetectedUser.email || 'Not available'}</p>
                        <p><strong>Phone:</strong> ${lastDetectedUser.phoneNumber || 'Not available'}</p>
                        <p><strong>Age:</strong> ${lastDetectedUser.age || 'Not available'}</p>
                        <p><strong>Gender:</strong> ${lastDetectedUser.gender || 'Not available'}</p>
                        <p><strong>Role:</strong> ${lastDetectedUser.role || 'Not available'}</p>
                    </div>
                    
                    <div class="col-md-6">
                        <h5 class="border-bottom pb-2">System Information</h5>
                        <p><strong>User ID:</strong> ${lastDetectedUser._id || 'Not available'}</p>
                        <p><strong>Security Code:</strong> ${lastDetectedUser.securityCode || 'Not available'}</p>
                        <p><strong>Created At:</strong> ${formatDate(lastDetectedUser.createdAt)}</p>
                        <p><strong>Updated At:</strong> ${formatDate(lastDetectedUser.updatedAt)}</p>
                        <p><strong>Last Seen:</strong> ${formatDate(lastDetectedUser.lastSeen)}</p>
                    </div>
                </div>

                <div class="row mt-3">
                    <div class="col-12">
                        <h5 class="border-bottom pb-2">Admin Information</h5>
                        <p><strong>Admin ID:</strong> ${lastDetectedUser.admin || 'Not available'}</p>
                        <p><strong>Admin Email:</strong> ${lastDetectedUser.adminEmail || 'Not available'}</p>
                        <p><strong>Admin Phone:</strong> ${lastDetectedUser.adminPhoneNumber || 'Not available'}</p>
                    </div>
                </div>

                <div class="row mt-3">
                    <div class="col-12">
                        <h5 class="border-bottom pb-2">Location</h5>
                        <p><strong>Latitude:</strong> ${lastDetectedUser.latitude || 'Not available'}</p>
                        <p><strong>Longitude:</strong> ${lastDetectedUser.longitude || 'Not available'}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    userDetailsModal.show();
}

// Show detected face
function showDetectedFace() {
    if (!lastDetectedFace) return;

    const canvas = document.createElement('canvas');
    canvas.width = lastDetectedFace.detection.box.width;
    canvas.height = lastDetectedFace.detection.box.height;
    const ctx = canvas.getContext('2d');

    // Draw the face from the video
    ctx.drawImage(
        video,
        lastDetectedFace.detection.box.x,
        lastDetectedFace.detection.box.y,
        lastDetectedFace.detection.box.width,
        lastDetectedFace.detection.box.height,
        0,
        0,
        canvas.width,
        canvas.height
    );

    // Show the face in the modal
    const detectedFaceImage = document.getElementById('detectedFaceImage');
    detectedFaceImage.src = canvas.toDataURL('image/jpeg');
    detectedFaceModal.show();
}

// Initialize application
async function init() {
    try {
        await loadModels();
        await initVideo();

        // Initialize modals
        detectedFaceModal = new bootstrap.Modal(document.getElementById('detectedFaceModal'));
        userDetailsModal = new bootstrap.Modal(document.getElementById('userDetailsModal'));

        // Event listeners
        document.getElementById('startBtn').addEventListener('click', startDetection);
        document.getElementById('stopBtn').addEventListener('click', stopDetection);
        document.getElementById('faceDetectedBtn').addEventListener('click', showDetectedFace);
        document.getElementById('statusAccessBtn').addEventListener('click', () => {
            if (lastDetectedUser) {
                showUserDetails();
            }
        });
        document.getElementById('logToggleBtn').addEventListener('click', toggleLog);
    } catch (error) {
        console.error('Initialization error:', error);
        showAlert('Error initializing the application. Please refresh the page.', 'danger');
    }
}

// Start the application when the page loads
window.addEventListener('load', init); 