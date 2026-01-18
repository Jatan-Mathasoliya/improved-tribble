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

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Add subtle gradient overlay
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, 'rgba(123, 56, 251, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 91, 168, 0.05)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Add subtle dot pattern (simulated)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let x = 0; x < WIDTH; x += 30) {
    for (let y = 0; y < HEIGHT; y += 30) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Load and draw logo
  try {
    const logoPath = path.join(__dirname, '../client/public/brand/vantahire-logo-large.png');
    const logo = await loadImage(logoPath);

    // Draw logo on the left side
    const logoSize = 180;
    const logoX = 100;
    const logoY = (HEIGHT - logoSize) / 2 - 30;
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

    // "VantaHire" text with gradient effect
    ctx.font = 'bold 72px Arial, sans-serif';

    // Create gradient for VantaHire text
    const textGradient = ctx.createLinearGradient(320, 0, 700, 0);
    textGradient.addColorStop(0, COLORS.pink);
    textGradient.addColorStop(0.5, COLORS.primaryPurple);
    textGradient.addColorStop(1, COLORS.pink);

    ctx.fillStyle = textGradient;
    ctx.fillText('VantaHire', 320, 280);

    // Main tagline
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.fillStyle = COLORS.white;
    ctx.fillText('Recruiting Velocity, by Design', 320, 350);

    // Sub tagline
    ctx.font = '28px Arial, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Human decisions, AI acceleration.', 320, 410);

    // Decorative line
    const lineGradient = ctx.createLinearGradient(320, 0, 620, 0);
    lineGradient.addColorStop(0, COLORS.primaryPurple);
    lineGradient.addColorStop(1, COLORS.pink);
    ctx.fillStyle = lineGradient;
    ctx.fillRect(320, 440, 300, 4);

    // Website URL
    ctx.font = '22px Arial, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('www.vantahire.com', 320, 490);

  } catch (err) {
    console.error('Error loading logo:', err);

    // Fallback: Draw text-only version
    ctx.font = 'bold 80px Arial, sans-serif';
    const textGradient = ctx.createLinearGradient(200, 0, 600, 0);
    textGradient.addColorStop(0, COLORS.pink);
    textGradient.addColorStop(1, COLORS.primaryPurple);
    ctx.fillStyle = textGradient;
    ctx.fillText('VantaHire', 200, 250);

    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.fillStyle = COLORS.white;
    ctx.fillText('Recruiting Velocity, by Design', 200, 330);

    ctx.font = '28px Arial, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Human decisions, AI acceleration.', 200, 400);
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

  // Same design as OG image
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, 'rgba(123, 56, 251, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 91, 168, 0.05)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Dot pattern
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let x = 0; x < WIDTH; x += 30) {
    for (let y = 0; y < HEIGHT; y += 30) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  try {
    const logoPath = path.join(__dirname, '../client/public/brand/vantahire-logo-large.png');
    const logo = await loadImage(logoPath);

    const logoSize = 180;
    const logoX = 100;
    const logoY = (HEIGHT - logoSize) / 2 - 30;
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

    const textGradient = ctx.createLinearGradient(320, 0, 700, 0);
    textGradient.addColorStop(0, COLORS.pink);
    textGradient.addColorStop(0.5, COLORS.primaryPurple);
    textGradient.addColorStop(1, COLORS.pink);

    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.fillStyle = textGradient;
    ctx.fillText('VantaHire', 320, 280);

    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.fillStyle = COLORS.white;
    ctx.fillText('Recruiting Velocity, by Design', 320, 350);

    ctx.font = '28px Arial, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Human decisions, AI acceleration.', 320, 410);

    const lineGradient = ctx.createLinearGradient(320, 0, 620, 0);
    lineGradient.addColorStop(0, COLORS.primaryPurple);
    lineGradient.addColorStop(1, COLORS.pink);
    ctx.fillStyle = lineGradient;
    ctx.fillRect(320, 440, 300, 4);

    ctx.font = '22px Arial, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('www.vantahire.com', 320, 490);

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
