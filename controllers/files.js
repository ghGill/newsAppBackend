// Backend — controllers/files.js
//
// Files Controller
// This module handles all file-related operations in the backend.
// It supports both legacy disk-based storage and new AWS S3 direct uploads via pre-signed URLs.
// 
// Key Features:
// - Legacy handlers: upload (server receives file) and delete.
// - New S3 handlers: presign (generate signed URL for client to upload directly to S3) and finalize (verify the upload).
// - Input parsing: Flexible extraction of parameters from request body, query strings, or custom headers (e.g., x-file-name).
//   This makes the API tolerant to different client implementations (JSON, FormData, proxies).
// - Environment checks: Operations like presign/finalize are gated behind STORAGE_TYPE='AWS_S3'.
// - Error handling: Consistent JSON responses { success: false, message: '...' } for failures.
// - Logging: Console logs for key actions (presign key generation, finalize object details) to aid debugging.
// 
// Dependencies:
// - AWS SDK: For S3 interactions (presigned URLs, HEAD object).
// - envVar: Reads configuration from environment variables.
// - storage: Handles legacy file uploads to disk or server-mediated S3.
// - deleteMovieFile: Service to delete files, abstracting storage type.
// 
// Usage: Instantiated as a singleton and used by routes/files.js.
// 
// S3 Upload Flow Overview:
// 1. Client calls /presign: Backend validates, constructs S3 key (e.g., movies/subFolder/file.mp4), generates temporary signed PUT URL.
// 2. Client uploads directly to S3 using the URL (bypasses server bandwidth).
// 3. Client calls /finalize: Backend performs HEAD on S3 object to confirm existence and non-zero size, then returns public URL.
// 
// Security Notes:
// - Signed URLs expire in 15 minutes (900 seconds).
// - Content-Type must match between presign and upload.
// - Access restricted by AWS credentials in env vars.
// 
// Potential Improvements:
// - Add ACL or metadata to putObject params if needed (e.g., for public read).
// - Integrate with database to store upload metadata post-finalize.

const AWS = require('aws-sdk');                        // AWS SDK v2 for S3 client operations (putObject signing, headObject).
const { envVar } = require('../services/env');         // Utility to access environment variables securely.
const { deleteMovieFile } = require('../services/movies'); // Service function to handle file deletion, determines storage backend.
const storage = require('../services/storage');        // Legacy storage service for server-side file handling (e.g., multer parsing).

/**
 * firstNonEmpty: Utility function to select the first non-undefined, non-null, non-empty string from a list of values.
 * Purpose: Allows flexible parameter passing in requests (e.g., body.fileName or headers['x-file-name']).
 * Trims strings and converts to string for checking emptiness.
 * Returns: The first valid value or undefined.
 */
function firstNonEmpty(...vals) {
    for (const v of vals) {
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return undefined;
}

/**
 * decodeMaybe: Safely decodes a URL-encoded string (e.g., %20 to space).
 * Purpose: Handles encoded values in headers or query params without crashing on invalid input.
 * If input is not a string or decoding fails, returns the original value unchanged.
 * Uses decodeURIComponent with try-catch for robustness.
 */
function decodeMaybe(v) {
    if (typeof v !== 'string') return v;
    try { return decodeURIComponent(v); } catch { return v; }
}

/**
 * parseUploadRequest: Parses inputs required for the presign handler.
 * Sources checked in order: body (various key aliases like fileName/filename/name), query, headers (x- prefixes for FormData compatibility).
 * - fileName: Required, decoded.
 * - subFolder: Optional, treated as null if 'null' or 'undefined' string.
 * - contentType: From explicit params, falls back to request 'content-type' header (if not multipart), defaults to 'application/octet-stream'.
 * Purpose: Makes the endpoint resilient to different client formats (JSON POST vs. FormData with headers).
 * Returns: Object with { fileName, subFolder, contentType }.
 */
function parseUploadRequest(req) {
    const body = (req && req.body) ? req.body : {};
    const query = (req && req.query) ? req.query : {};
    const hdr = (req && req.headers) ? req.headers : {};

    // Extract fileName with multiple possible keys for flexibility.
    let fileName = firstNonEmpty(body.fileName, body.filename, body.name, query.fileName, query.filename, query.name, hdr['x-file-name'], hdr['x-filename']);
    fileName = decodeMaybe(fileName);

    // Extract subFolder, normalize null values.
    let subFolderRaw = firstNonEmpty(body.subFolder, query.subFolder, hdr['x-sub-folder']);
    subFolderRaw = decodeMaybe(subFolderRaw);
    const subFolder = (subFolderRaw === 'null' || subFolderRaw === 'undefined') ? null : subFolderRaw;

    // Extract contentType with aliases, decode if needed.
    const explicitCT = firstNonEmpty(body.contentType, body.mimeType, query.contentType, query.mimeType, hdr['x-content-type']);
    let contentType = decodeMaybe(explicitCT || '');
    
    // Fallback logic: If no explicit CT and request is not multipart/form-data, use the Content-Type header.
    if (!contentType) {
        const hct = hdr['content-type'];
        if (hct && !/^multipart\/form-data/i.test(hct)) contentType = hct.split(';')[0].trim();
    }
    // Final default for binary safety.
    if (!contentType) contentType = 'application/octet-stream';

    return { fileName, subFolder, contentType };
}

/**
 * parseFinalizeRequest: Similar parsing for the finalize handler.
 * - objectKey: Required (the S3 key from presign), from body/query/custom header.
 * - fileName: Optional, for echoing back to client.
 * - subFolder: Optional, normalized to null if specified as such.
 * Purpose: Consistency with pres  parseUploadRequest, handles same flexible input sources.
 * Returns: Object with { objectKey, fileName, subFolder }.
 */
function parseFinalizeRequest(req) {
    const body = (req && req.body) ? req.body : {};
    const query = (req && req.query) ? req.query : {};
    const hdr = (req && req.headers) ? req.headers : {};

    // objectKey is critical for S3 verification.
    let objectKey = firstNonEmpty(body.objectKey, query.objectKey, hdr['x-object-key']);
    objectKey = decodeMaybe(objectKey);

    // fileName for client-side use (e.g., display).
    let fileName = firstNonEmpty(body.fileName, body.filename, body.name, query.fileName, query.filename, query.name, hdr['x-file-name'], hdr['x-filename']);
    fileName = decodeMaybe(fileName);

    // subFolder handling.
    let subFolderRaw = firstNonEmpty(body.subFolder, query.subFolder, hdr['x-sub-folder']);
    subFolderRaw = decodeMaybe(subFolderRaw);
    const subFolder = (subFolderRaw === 'null' || subFolderRaw === 'undefined') ? null : subFolderRaw;

    return { objectKey, fileName, subFolder };
}

// filesController class: Groups all handler methods with shared state (lazy S3 client).
class filesController {
    // Constructor: Initializes null S3 client, binds methods to ensure 'this' context in Express routers.
    constructor() {
        this._s3 = null; // Lazily created to avoid unnecessary AWS init if not using S3.

        // Binding prevents context loss when methods are passed as callbacks.
        this.upload   = this.upload.bind(this);
        this.delete   = this.delete.bind(this);
        this.presign  = this.presign.bind(this);
        this.finalize = this.finalize.bind(this);
    }

    // s3(): Getter for S3 client instance.
    // Creates once using env vars for credentials and region.
    // Purpose: Delays creation until needed, allows reuse.
    s3() {
        if (!this._s3) {
            this._s3 = new AWS.S3({
                accessKeyId: envVar('AWS_ACCESS_KEY_ID'),
                secretAccessKey: envVar('AWS_SECRET_ACCESS_KEY'),
                region: envVar('AWS_REGION')
            });
        }
        return this._s3;
    }

    /**
     * upload: Handler for legacy /upload route.
     * Assumes multipart/form-data input, delegates to storage service.
     * Response: 200 with result on success, 500 with error object otherwise.
     * Note: Bypassed in S3 direct mode; kept for disk or compatible clients.
     */
    async upload(req, res) {
        try {
            // storage.uploadFile processes req (e.g., via multer) and returns result.
            const result = await storage.uploadFile(req, res);
            // If result indicates success, send 200; else 500.
            if (result && result.success) res.status(200).json(result);
            else res.status(500).json(result || { success:false, message:'Upload failed' });
        } catch (e) {
            // Catch unexpected errors, log implicitly via e, respond with JSON error.
            res.status(500).json({ success: false, message: e.message });
        }
    }

    /**
     * delete: Handler for /delete route.
     * Extracts fileName and subFolder from body.
     * Calls deleteMovieFile which abstracts storage (S3 deleteObject or disk fs.unlink).
     * Response: Similar success/error JSON format.
     */
    async delete(req, res) {
        try {
            const { fileName, subFolder=null } = req.body || {};
            const result = await deleteMovieFile(fileName, subFolder);
            if (result && result.success) res.status(200).json(result);
            else res.status(500).json(result || { success:false, message:'Delete failed' });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    /**
     * presign: Handler for /presign (S3 step 1).
     * - Validates STORAGE_TYPE.
     * - Parses inputs.
     * - Constructs S3 key: [MOVIES_FOLDER]/[subFolder/]fileName.
     * - Generates signed URL with getSignedUrl for putObject.
     * - Logs key details.
     * - Returns JSON with url, headers, objectKey, publicUrl.
     * Errors: 400 for bad config/input, 500 for exceptions.
     */
    async presign(req, res) {
        try {
            // Enforce S3 mode; early exit if not configured.
            const storageType = envVar('STORAGE_TYPE');
            if (storageType !== 'AWS_S3') {
                return res.status(400).json({ success: false, message: 'Presign is only available when STORAGE_TYPE=AWS_S3' });
            }

            // Parse flexible inputs.
            const { fileName, subFolder, contentType } = parseUploadRequest(req);
            if (!fileName) return res.status(400).json({ success: false, message: 'fileName is required' });

            // Config from env: bucket, region, folder prefix.
            const bucket = envVar('AWS_BUCKET');
            const region = envVar('AWS_REGION');
            const moviesFolder = envVar('MOVIES_FOLDER') || 'movies';
            // Build unique key to avoid collisions.
            const key = `${moviesFolder}/${subFolder ? subFolder + '/' : ''}${fileName}`;

            // Debug log for tracing.
            console.log(`[files.presign] name="${fileName}" sub="${subFolder}" ct="${contentType}" -> key="${key}"`);

            // Generate signed URL: Client must use PUT with matching ContentType.
            const url = this.s3().getSignedUrl('putObject', {
                Bucket: bucket,
                Key: key,
                ContentType: contentType,
                Expires: 900, // 15 minutes validity.
            });
            // Public URL for post-upload access (assumes bucket public or signed GET elsewhere).
            const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

            // Response includes everything client needs for upload.
            return res.status(200).json({
                success: true,
                url,
                method: 'PUT',
                headers: { 'Content-Type': contentType }, // Must be sent by client.
                objectKey: key,
                publicUrl
            });
        } catch (e) {
            // Log full error for server-side debugging.
            console.error('[files.presign] error:', e);
            res.status(500).json({ success: false, message: e.message });
        }
    }

    /**
     * finalize: Handler for /finalize (S3 step 3).
     * - Validates STORAGE_TYPE.
     * - Parses inputs (objectKey required).
     * - Performs HEAD on S3 to get metadata (ContentLength, etc.).
     * - Checks for non-empty object.
     * - Logs details.
     * - Returns public URL and echoed params in legacy format.
     * Errors: 400/409/500 based on issue (e.g., NotFound → specific message).
     */
    async finalize(req, res) {
        try {
            const storageType = envVar('STORAGE_TYPE');
            if (storageType !== 'AWS_S3') {
                return res.status(400).json({ success: false, message: 'Finalize is only available when STORAGE_TYPE=AWS_S3' });
            }

            const { objectKey, fileName, subFolder } = parseFinalizeRequest(req);
            if (!objectKey) return res.status(400).json({ success: false, message: 'objectKey is required' });

            const bucket = envVar('AWS_BUCKET');
            const region = envVar('AWS_REGION');

            // HEAD request: Efficient check without downloading data.
            const head = await this.s3().headObject({ Bucket: bucket, Key: objectKey }).promise();
            // Log metadata for auditing.
            console.log(`[files.finalize] key="${objectKey}" size=${head.ContentLength} ct="${head.ContentType}" etag=${head.ETag}`);

            // Validate upload integrity: Reject empty files.
            if (!head.ContentLength || head.ContentLength === 0) {
                return res.status(409).json({ success: false, message: 'Uploaded object is empty (0 bytes). Please retry.' });
            }

            // Construct public URL.
            const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`;

            // Mirror legacy response shape for UI compatibility.
            return res.status(200).json({
                success: true,
                url: publicUrl,
                file_name: fileName || (objectKey.split('/').pop() ), // Fallback to key's basename.
                subFolder: subFolder ?? null
            });
        } catch (e) {
            console.error('[files.finalize] error:', e);
            // Specific message for missing object.
            const msg = (e && e.code === 'NotFound') ? 'Object not found in S3 (upload may have failed)' : e.message;
            res.status(500).json({ success: false, message: msg });
        }
    }
}

// Export a single instance to be shared across requests.
module.exports = new filesController();