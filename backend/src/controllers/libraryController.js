const pool = require('../config/db');
const supabase = require('../config/supabase');
const path = require('path');
const { randomUUID } = require('crypto');

const BUCKET_NAME = 'studyhub-library';

const ALLOWED_FILES = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png'
};

// Upload a learning material
const uploadLibraryFile = async (req, res) => {
    let storageKey;

    try {
        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'Please select a file to upload.'
            });
        }

        const extension = path.extname(req.file.originalname).toLowerCase();
        const expectedMimeType = ALLOWED_FILES[extension];

        if (!expectedMimeType || req.file.mimetype !== expectedMimeType) {
            return res.status(400).json({
                status: 'error',
                message: 'This file type is not allowed.'
            });
        }

        const title = (req.body.title || req.file.originalname)
            .trim()
            .slice(0, 255);

        const category = (req.body.category || 'Uncategorized')
            .trim()
            .slice(0, 100);

        const description = req.body.description || null;

        const safeFileName = path.basename(req.file.originalname)
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(-150);

        storageKey = `${req.user.id}/${randomUUID()}-${safeFileName}`;

        // Upload file to private Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storageKey, req.file.buffer, {
                contentType: expectedMimeType,
                upsert: false
            });

        if (uploadError) {
            throw uploadError;
        }

        // Save file information in PostgreSQL
        const result = await pool.query(
            `INSERT INTO library_items
            (user_id, title, original_file_name, category,
             description, storage_provider, storage_key,
             mime_type, file_extension, file_size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id, title, original_file_name, category,
                       description, mime_type, file_size_bytes, created_at`,
            [
                req.user.id,
                title,
                req.file.originalname,
                category,
                description,
                'supabase',
                storageKey,
                expectedMimeType,
                extension,
                req.file.size
            ]
        );

        return res.status(201).json({
            status: 'success',
            message: 'File uploaded successfully.',
            file: result.rows[0]
        });

    } catch (error) {
        // Remove uploaded file if saving its database record fails
        if (storageKey) {
            await supabase.storage
                .from(BUCKET_NAME)
                .remove([storageKey]);
        }

        console.error('Library upload error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to upload file. Please try again.'
        });
    }
};

// Get files belonging to the logged-in student
const getLibraryFiles = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, original_file_name, category,
                    description, mime_type, file_extension,
                    file_size_bytes, created_at, updated_at
             FROM library_items
             WHERE user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC`,
            [req.user.id]
        );

        return res.status(200).json({
            status: 'success',
            count: result.rows.length,
            files: result.rows
        });

    } catch (error) {
        console.error('Library retrieval error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve library files.'
        });
    }
};

const downloadLibraryFile = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT storage_key, original_file_name
             FROM library_items
             WHERE id = $1 AND user_id = $2
             AND deleted_at IS NULL`,
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'File not found.'
            });
        }

        const file = result.rows[0];

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(file.storage_key, 60, {
                download: file.original_file_name
            });

        if (error) throw error;

        return res.json({
            status: 'success',
            downloadUrl: data.signedUrl
        });

    } catch (error) {
        console.error('Download error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Unable to download file.'
        });
    }
};


// PREVIEW A LIBRARY FILE INSIDE STUDYHUB
const previewLibraryFile = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT storage_key, original_file_name, mime_type
             FROM library_items
             WHERE id = $1
             AND user_id = $2
             AND deleted_at IS NULL`,
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'File not found.'
            });
        }

        const file = result.rows[0];

        // Generate a temporary preview URL (5 minutes)
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(file.storage_key, 300);

        if (error) throw error;

        return res.status(200).json({
            status: 'success',
            message: 'Preview URL generated successfully.',
            previewUrl: data.signedUrl,
            fileName: file.original_file_name,
            mimeType: file.mime_type
        });

    } catch (error) {
        console.error('Library preview error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to preview file.'
        });
    }
};

const updateLibraryFile = async (req, res) => {
    try {
        const { title, category, description } = req.body;

        if (
            title !== undefined &&
            (typeof title !== 'string' || !title.trim() || title.trim().length > 255)
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Title must contain 1–255 characters.'
            });
        }

        if (
            category !== undefined &&
            (typeof category !== 'string' || !category.trim() || category.trim().length > 100)
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Category must contain 1–100 characters.'
            });
        }

        const result = await pool.query(
            `UPDATE library_items
             SET title = COALESCE($1, title),
                 category = COALESCE($2, category),
                 description = COALESCE($3, description),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 AND user_id = $5
             AND deleted_at IS NULL
             RETURNING id, title, category, description, updated_at`,
            [
                title === undefined ? null : title.trim(),
                category === undefined ? null : category.trim(),
                description === undefined ? null : description,
                req.params.id,
                req.user.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'File not found.'
            });
        }

        return res.json({
            status: 'success',
            message: 'Library file updated successfully.',
            file: result.rows[0]
        });

    } catch (error) {
        console.error('Update error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Unable to update file.'
        });
    }
};

const deleteLibraryFile = async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE library_items
             SET deleted_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2
             AND deleted_at IS NULL
             RETURNING storage_key`,
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'File not found.'
            });
        }

        const storageKey = result.rows[0].storage_key;

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([storageKey]);

        if (error) {
            console.error('Storage cleanup error:', error.message);
        }

        return res.json({
            status: 'success',
            message: 'Library file deleted successfully.'
        });

    } catch (error) {
        console.error('Delete error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Unable to delete file.'
        });
    }
};


module.exports = {
    uploadLibraryFile,
    getLibraryFiles,
    downloadLibraryFile,
    previewLibraryFile,
    updateLibraryFile,
    deleteLibraryFile
};