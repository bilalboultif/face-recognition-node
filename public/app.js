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
        faceDescriptor = detections[0].descriptor;

        // Create canvas for capture
        canvas = document.getElementById('canvas');
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
        const ctx = canvas.getContext('2d');

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, displaySize.width, displaySize.height);

        // Draw face detection
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        faceapi.draw.drawDetections(canvas, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

        // Display captured image
        capturedImage = document.getElementById('capturedImage');
        capturedImage.src = canvas.toDataURL('image/jpeg');
        capturedImage.style.display = 'block';
        document.getElementById('noImageMessage').style.display = 'none';

        showAlert('Face captured successfully!', 'success');
    } catch (error) {
        console.error('Error capturing face:', error);
        showAlert('Error capturing face. Please try again.', 'danger');
    }
}

// Handle form submission
async function handleSubmit(event) {
    event.preventDefault();

    if (!faceDescriptor) {
        showAlert('Please capture your face before submitting.', 'warning');
        return;
    }

    // Validate form fields
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (password.length < 6) {
        showAlert('Password must be at least 6 characters long', 'warning');
        return;
    }

    if (!isValidEmail(email)) {
        showAlert('Please enter a valid email address', 'warning');
        return;
    }

    try {
        // Compress the image before sending
        const compressedImage = await compressImage(capturedImage.src);

        // Create a regular object instead of FormData
        const data = {
            username: document.getElementById('username').value,
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: email,
            phoneNumber: document.getElementById('phoneNumber').value,
            age: document.getElementById('age').value,
            gender: document.getElementById('gender').value,
            password: password,
            faceDescriptor: JSON.stringify(Array.from(faceDescriptor)),
            image: compressedImage,
        
            // New fields
            role: document.getElementById('role').value,
            securityCode: document.getElementById('securityCode').value,
            adminEmail: document.getElementById('adminEmail').value,
            adminPhoneNumber: document.getElementById('adminPhoneNumber').value,
            alertType: document.getElementById('alertType').value || 'none'
        };
        

        console.log('Sending registration data...');

        const response = await fetch('http://localhost:5555/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const responseData = await response.json();

        if (response.ok) {
            showAlert('Registration successful!', 'success');
            document.getElementById('registrationForm').reset();
            capturedImage.style.display = 'none';
            document.getElementById('noImageMessage').style.display = 'block';
            faceDescriptor = null;
        } else {
            if (responseData.error === 'Username or email already exists') {
                showAlert('This username or email is already registered. Please use different credentials.', 'warning');
            } else {
                showAlert(responseData.error || 'Registration failed', 'danger');
            }
            console.error('Registration error:', responseData);
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error during registration. Please try again.', 'danger');
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