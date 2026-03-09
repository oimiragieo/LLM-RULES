'use strict';

/**
 * Image Metadata Extractor
 * ========================
 * Uses `sharp` to parse image headers (EXIF, Dimensions, Format) without 
 * invoking LLM Vision, conserving tokens and processing lazily.
 */

const fs = require('fs');

/**
 * Extracts basic semantic metadata from an image buffer using `sharp`.
 * 
 * @param {Buffer|string} source - Image Buffer or file path 
 * @returns {Promise<{ format: string, width: number, height: number, sizeBytes: number, summary: string }>}
 */
async function extractMetadata(source) {
    try {
        // Lazy load sharp to avoid startup penalty
        const sharp = require('sharp');

        let buffer;
        if (typeof source === 'string') {
            if (!fs.existsSync(source)) {
                throw new Error(`File not found: ${source}`);
            }
            buffer = fs.readFileSync(source);
        } else if (Buffer.isBuffer(source)) {
            buffer = source;
        } else {
            throw new Error('source must be a file path or Buffer');
        }

        const metadata = await sharp(buffer).metadata();
        const sizeBytes = buffer.length;

        return {
            format: metadata.format || 'unknown',
            width: metadata.width || 0,
            height: metadata.height || 0,
            sizeBytes,
            summary: `Image format: ${metadata.format || 'unknown'}, Dimensions: ${metadata.width}x${metadata.height}`
        };

    } catch (err) {
        return {
            format: 'error',
            width: 0,
            height: 0,
            sizeBytes: 0,
            summary: `Failed to extract image metadata: ${err.message}`
        };
    }
}

module.exports = {
    extractMetadata
};
