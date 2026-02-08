"use strict";
// Twitter/X verification utilities
// Uses nitter or public tweet embeds to verify tweets
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTweet = verifyTweet;
exports.generateVerificationCode = generateVerificationCode;
async function verifyTweet(tweetUrl, expectedCode, expectedName) {
    // Extract tweet ID from URL
    const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
    if (!tweetIdMatch) {
        return { valid: false, error: 'Invalid tweet URL' };
    }
    const tweetId = tweetIdMatch[1];
    try {
        // Use Twitter's public embed API (doesn't require auth)
        const embedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;
        const response = await fetch(embedUrl);
        if (!response.ok) {
            return { valid: false, error: 'Could not fetch tweet' };
        }
        const data = await response.json();
        const html = data.html;
        // Extract tweet content from embed HTML
        // The content is between the <p> tags
        const contentMatch = html.match(/<p[^>]*>(.*?)<\/p>/s);
        if (!contentMatch) {
            return { valid: false, error: 'Could not parse tweet content' };
        }
        // Clean HTML entities and tags
        let content = contentMatch[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
        // Check if tweet contains the verification code
        const codePattern = new RegExp(expectedCode, 'i');
        if (!codePattern.test(content)) {
            return { valid: false, error: 'Tweet does not contain verification code' };
        }
        // Check if tweet mentions Lobster Trap or clawmegle
        const contextPattern = /lobster\s*trap|clawmegle/i;
        if (!contextPattern.test(content)) {
            return { valid: false, error: 'Tweet must mention Lobster Trap or Clawmegle' };
        }
        // Extract author from embed
        const authorMatch = data.author_name || 'unknown';
        return {
            valid: true,
            tweetId,
            author: authorMatch,
            content,
        };
    }
    catch (error) {
        console.error('Tweet verification error:', error);
        return { valid: false, error: 'Failed to verify tweet' };
    }
}
function generateVerificationCode() {
    // Generate a 6-character alphanumeric code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
