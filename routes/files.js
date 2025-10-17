// Backend — routes/files.js
//
// Express Router for File-Related Endpoints
// This module defines the routing for all file operations in the application.
// It acts as a thin layer, mapping HTTP methods and paths to controller handlers.
// 
// Key Features:
// - Legacy routes: /upload and /delete for disk-based or old clients.
// - New routes: /presign and /finalize for S3 direct-upload flow.
// - Prefix: Intended to be mounted at /api/files (see app.use in main server).
// - POST methods: Used for all to allow bodies/headers.
// 
// Integration:
// - Requires express and the filesController instance.
// - Exported router is plugged into the main Express app.
// 
// Request Flow:
// - Express receives request → Matches route → Calls controller method with (req, res).
// - Controller handles logic, res.json for responses.
// 
// Security Notes:
// - No auth middleware here; assume applied globally or in app setup.
// - Relies on controller for input validation.
// 
// Potential Improvements:
// - Add middleware for auth checks specific to files.
// - Rate limiting on upload-related routes.
// - Versioning (e.g., /v1/files/presign).

const express = require("express");              // Core Express framework for routing and middleware.
const router = express.Router();                 // Router instance to group related routes.
const filesController = require("../controllers/files"); // Imported controller with business logic.

// POST /upload: Legacy endpoint where server receives and processes the file upload.
// Uses multipart/form-data, handled by storage service in controller.
router.post('/upload', filesController.upload);  // Delegates to controller.upload.

// POST /delete: Deletes a file by specifying name and optional subFolder in body.
// Storage-agnostic (disk or S3).
router.post('/delete', filesController.delete);  // Delegates to controller.delete.

// POST /presign: New endpoint for S3 direct uploads (step 1).
// Client sends file metadata, receives signed URL.
router.post('/presign', filesController.presign);   // Delegates to controller.presign.

// POST /finalize: New endpoint for S3 uploads (step 3).
// Client sends objectKey, server verifies via S3 HEAD.
router.post('/finalize', filesController.finalize); // Delegates to controller.finalize.

// Export the configured router for mounting in the main app (e.g., app.use('/api/files', router)).
module.exports = router;