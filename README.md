# Face Recognition Registration System

A Node.js web application for user registration with face recognition capabilities.

## Features

- User registration with face capture
- Face detection and recognition using face-api.js
- MongoDB database integration
- Responsive web interface
- Secure password hashing
- Image storage and face descriptor management

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Modern web browser with camera access

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a .env file in the root directory with the following content:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/face_recognition_db
```

3. Download face-api.js models:
   - Create a `public/models` directory
   - Download the required models from [face-api.js models](https://github.com/justadudewhohacks/face-api.js/tree/master/weights)
   - Place the following files in the `public/models` directory:
     - ssd_mobilenetv1_model-weights_manifest.json
     - ssd_mobilenetv1_model-shard1
     - face_landmark_68_model-weights_manifest.json
     - face_landmark_68_model-shard1
     - face_recognition_model-weights_manifest.json
     - face_recognition_model-shard1

4. Start the application:
```bash
npm start
```

5. Access the application at `http://localhost:3000`

## Usage

1. Fill in the registration form with user details
2. Click "Capture Face" to take a photo
3. Ensure your face is clearly visible in the camera
4. Click "Register" to submit the form
5. The system will process the registration and store the user data

## API Endpoints

- POST `/api/register` - Register a new user
- GET `/api/users` - Get all users
- GET `/api/users/:id` - Get user by ID

## Security

- Passwords are hashed using bcrypt
- Face descriptors are stored securely
- Input validation and sanitization
- CORS enabled for API access

## Error Handling

The application includes comprehensive error handling for:
- Camera access issues
- Face detection failures
- Database connection problems
- Form validation errors

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request 