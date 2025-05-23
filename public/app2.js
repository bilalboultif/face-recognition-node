// Global variables
let video;
let canvas;
let capturedImage;
let faceDescriptor = null;
let isModelLoaded = false;
let isDetecting = false;

// Show alert message
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.card-body').insertBefore(alertDiv, document.querySelector('form'));
    setTimeout(() => alertDiv.remove(), 5000);
}

// Function to validate email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Function to compress image
function compressImage(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Set maximum dimensions
            const MAX_WIDTH = 640;
            const MAX_HEIGHT = 480;

            // Calculate new dimensions
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            // Set canvas dimensions
            canvas.width = width;
            canvas.height = height;

            // Draw and compress image
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7)); // 0.7 is the quality factor
        };
        img.src = dataUrl;
    });
}

// Wait for face-api.js to load
document.addEventListener('DOMContentLoaded', () => {
    // Check if face-api is loaded
    if (typeof faceapi === 'undefined') {
        console.error('face-api.js is not loaded');
        showAlert('Error: Face detection library not loaded. Please refresh the page.', 'danger');
        return;
    }
    
    // Initialize the application
    init();
});

// Initialize face-api.js models
async function loadModels() {
    try {
        console.log('Loading face detection models...');
        
        // Load models with explicit paths and options
        const MODEL_URL = './models';
        
        // Load models one by one with verification
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
        
        // Enable the capture button once models are loaded
        document.getElementById('captureBtn').disabled = false;
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

        // Wait for video to be ready
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // Set video dimensions
                video.width = video.videoWidth;
                video.height = video.videoHeight;
                // Start face detection after video is ready
                startFaceDetection();
                resolve();
            };
        });
    } catch (error) {
        console.error('Error accessing camera:', error);
        showAlert('Error accessing camera. Please ensure you have granted camera permissions.', 'danger');
    }
}

// Real-time face detection
async function startFaceDetection() {
    if (!isModelLoaded || isDetecting || !video || !video.videoWidth) return;
    
    isDetecting = true;
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
    video.parentElement.style.position = 'relative';
    video.parentElement.appendChild(detectionCanvas);
    
    async function detectFaces() {
        if (!isDetecting) return;
        
        try {
            const detections = await faceapi.detectAllFaces(video)
                .withFaceLandmarks()
                .withFaceDescriptors();
            
            // Clear canvas
            ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
            
            // Draw detections
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            faceapi.draw.drawDetections(detectionCanvas, resizedDetections);
            faceapi.draw.drawFaceLandmarks(detectionCanvas, resizedDetections);
            
            // Continue detection
            requestAnimationFrame(detectFaces);
        } catch (error) {
            console.error('Error in face detection:', error);
            isDetecting = false;
        }
    }
    
    detectFaces();
}

// Capture face image
async function captureFace() {
    if (!isModelLoaded) {
        showAlert('Face detection models are still loading. Please wait.', 'warning');
        return;
    }

    try {
        // Ensure video is playing and has valid dimensions
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            showAlert('Please wait for the video to be ready.', 'warning');
            return;
        }

        const displaySize = { 
            width: video.videoWidth || 640, 
            height: video.videoHeight || 480 
        };

        // Detect faces
        const detections = await faceapi.detectAllFaces(video)
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (detections.length === 0) {
            showAlert('No face detected. Please position your face in the camera view.', 'warning');
            return;
        }

        if (detections.length > 1) {
            showAlert('Multiple faces detected. Please ensure only one face is visible.', 'warning');
            return;
        }

        // Get face descriptor
        faceDescriptor = detections[0].descriptor; // This will set the global faceDescriptor variable

        // Create canvas for capture
        canvas = document.getElementById('canvas');
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
        const ctx = canvas.getContext('2d');

      // Draw video frame to canvas
// Step 1: Draw the video frame onto canvas (clean)
ctx.drawImage(video, 0, 0, displaySize.width, displaySize.height);

// Step 2: Save raw image (clean face image, no drawing)
const rawImageData = canvas.toDataURL('image/jpeg'); // ✅ save this version

// Step 3: Resize detection results
const resizedDetections = faceapi.resizeResults(detections, displaySize);

// Step 4: Draw detections and landmarks (only for UI)
faceapi.draw.drawDetections(canvas, resizedDetections);
faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

// Step 5: Show image with drawing for user
capturedImage = document.getElementById('capturedImage');
capturedImage.src = canvas.toDataURL('image/jpeg'); // 🟥 with drawing
capturedImage.dataset.rawImage = rawImageData;      // ✅ clean version for backend
capturedImage.style.display = 'block';
document.getElementById('noImageMessage').style.display = 'none';

// Save the clean image for backend
capturedImage.dataset.rawImage = rawImageData;

        showAlert('Face captured successfully!', 'success');
    } catch (error) {
        console.error('Error capturing face:', error);
        showAlert('Error capturing face. Please try again.', 'danger');
    }
}


async function handleSubmit(event) {
    event.preventDefault();

    // Get all form fields
    const adminId = document.getElementById('adminId').value;
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const age = document.getElementById('age').value;
    const gender = document.getElementById('gender').value;
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const image = document.getElementById('capturedImage').dataset.rawImage;

    // Check if faceDescriptor exists before proceeding with form submission
    if (!faceDescriptor) {
        alert("Please capture your face before submitting the form.");
        return;
    }

    // Validate passwords
    if (password !== confirmPassword) {
        alert("Passwords do not match");
        return;
    }

    // Prepare payload
    const payload = {
        adminId,
        username,
        email,
        phoneNumber,
        password,
        confirmPassword,
        age,
        gender,
        firstName,
        lastName,
        image,
        faceDescriptor, // Send the captured face descriptor
    };

    try {
        // Send the request to the server
        const response = await fetch('http://localhost:5555/register-client', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (response.status === 200) {
            alert('Client registered successfully');
        } else {
            alert(`Error: ${result.message}`);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}


// Initialize application
async function init() {
    try {
        await loadModels();
        await initVideo();

        // Event listeners
        document.getElementById('captureBtn').addEventListener('click', captureFace);
        document.getElementById('registrationForm').addEventListener('submit', handleSubmit);
    } catch (error) {
        console.error('Initialization error:', error);
        showAlert('Error initializing the application. Please refresh the page.', 'danger');
    }
}

// Start the application when the page loads
window.addEventListener('load', init); 

