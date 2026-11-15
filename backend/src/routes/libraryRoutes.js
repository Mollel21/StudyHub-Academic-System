const express = require('express');
const multer = require('multer');

const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
    uploadLibraryFile,
    getLibraryFiles,
    downloadLibraryFile,
    previewLibraryFile,
    updateLibraryFile,
    deleteLibraryFile
} = require('../controllers/libraryController');

// Store uploaded files temporarily in memory
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 40 * 1024 * 1024 // 40 MB
    }
});

// Upload a file
router.post(
    '/upload',
    protect,
    upload.single('file'),
    uploadLibraryFile
);

// Get logged-in student's files
router.get(
    '/',
    protect,
    getLibraryFiles
);

// Download a library file
router.get('/:id/download', protect, downloadLibraryFile);

// Preview a library file
router.get('/:id/preview', protect, previewLibraryFile);

// Rename or update category and description
router.patch('/:id', protect, updateLibraryFile);

// Delete a library file
router.delete('/:id', protect, deleteLibraryFile);

module.exports = router;