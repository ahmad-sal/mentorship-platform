// delete-uploads.js
const cloudinary = require('./cloudinary.cjs');

async function deleteAllUploadedFiles() {
  try {
    console.log('🔍 Fetching ALL files from Cloudinary (root folder)...');

    // Get all resources (no prefix = everything)
    const { resources } = await cloudinary.api.resources({
      type: 'upload',
      prefix: '', // <-- CHANGE: no prefix, finds everything
      max_results: 500
    });

    if (!resources || resources.length === 0) {
      console.log('✅ No files found to delete.');
      return;
    }

    console.log(`📁 Found ${resources.length} files.`);
    console.log(`⚠️ WARNING: This will delete ALL ${resources.length} files. Press Ctrl+C to cancel now.`);
    
    // Wait 5 seconds so you can cancel
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete each file
    for (const file of resources) {
      const result = await cloudinary.uploader.destroy(file.public_id);
      console.log(`🗑️ Deleted: ${file.public_id} (${result.result})`);
    }

    console.log('✅ All files deleted successfully. Your Supabase records are untouched.');
  } catch (error) {
    console.error('❌ Error deleting files:', error);
  }
}

deleteAllUploadedFiles();