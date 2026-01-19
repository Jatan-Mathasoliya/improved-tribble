/**
 * Generate OG Image for VantaHire
 * Creates a 1200x630 social sharing image with logo and new branding
 */

import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 1200;
const HEIGHT = 630;

// Brand colors
const COLORS = {
  background: '#0D0D1A',
  primaryPurple: '#7B38FB',
  pink: '#FF5BA8',
  gold: '#F59E0B',
  white: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.7)',
};

async function generateOgImage() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background - match logo background exactly (#1a1a2e is the logo bg)
  const logoBgColor = '#1c1f28';
  ctx.fillStyle = logoBgColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Load and draw logo - centered and larger
  try {
    const logoPath = path.join(__dirname, '../client/src/assets/vantahire-logo.png');
    const logo = await loadImage(logoPath);

    // Draw logo centered, maintain aspect ratio
    const maxSize = 400;
    const scale = Math.min(maxSize / logo.width, maxSize / logo.height);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    const logoX = (WIDTH - logoWidth) / 2;
    const logoY = (HEIGHT - logoHeight) / 2;
    ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);

  } catch (err) {
    console.error('Error loading logo:', err);

    // Fallback: Draw text-only version
    ctx.font = 'bold 100px Arial, sans-serif';
    const textGradient = ctx.createLinearGradient(300, 0, 900, 0);
    textGradient.addColorStop(0, COLORS.pink);
    textGradient.addColorStop(1, COLORS.primaryPurple);
    ctx.fillStyle = textGradient;
    ctx.textAlign = 'center';
    ctx.fillText('VantaHire', WIDTH / 2, HEIGHT / 2 + 30);
  }

  // Save the image
  const outputPath = path.join(__dirname, '../client/public/og-image.jpg');
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
  fs.writeFileSync(outputPath, buffer);

  console.log(`✅ OG image generated: ${outputPath}`);
  console.log(`   Size: ${WIDTH}x${HEIGHT}px`);
  console.log(`   File size: ${(buffer.length / 1024).toFixed(1)}KB`);
}

// Also generate twitter-image.jpg (same dimensions work)
async function generateTwitterImage() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Same design as OG image - match logo background
  const logoBgColor = '#1c1f28';
  ctx.fillStyle = logoBgColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  try {
    const logoPath = path.join(__dirname, '../client/src/assets/vantahire-logo.png');
    const logo = await loadImage(logoPath);

    // Draw logo centered, maintain aspect ratio
    const maxSize = 400;
    const scale = Math.min(maxSize / logo.width, maxSize / logo.height);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    const logoX = (WIDTH - logoWidth) / 2;
    const logoY = (HEIGHT - logoHeight) / 2;
    ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);

  } catch (err) {
    console.error('Error loading logo for Twitter image:', err);
  }

  const outputPath = path.join(__dirname, '../client/public/twitter-image.jpg');
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
  fs.writeFileSync(outputPath, buffer);

  console.log(`✅ Twitter image generated: ${outputPath}`);
}

// Run both
async function main() {
  console.log('🎨 Generating social sharing images...\n');
  await generateOgImage();
  await generateTwitterImage();
  console.log('\n✨ Done!');
}

main().catch(console.error);
