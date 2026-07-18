// Pure Node.js PNG icon generator - no external dependencies
// Generates a 128x128 PNG icon: terminal window + git branch design
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 128;
// RGBA buffer
const pixels = new Uint8Array(SIZE * SIZE * 4);

function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
    const idx = (y * SIZE + x) * 4;
    // Alpha blending over existing
    const srcA = a / 255;
    const dstA = pixels[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    pixels[idx + 0] = Math.round((r * srcA + pixels[idx + 0] * dstA * (1 - srcA)) / outA);
    pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
    pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
    pixels[idx + 3] = Math.round(outA * 255);
}

function fillRect(x0, y0, x1, y1, r, g, b, a = 255) {
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            setPixel(x, y, r, g, b, a);
        }
    }
}

function strokeRect(x0, y0, x1, y1, w, r, g, b, a = 255) {
    fillRect(x0, y0, x1, y0 + w - 1, r, g, b, a);
    fillRect(x0, y1 - w + 1, x1, y1, r, g, b, a);
    fillRect(x0, y0, x0 + w - 1, y1, r, g, b, a);
    fillRect(x1 - w + 1, y0, x1, y1, r, g, b, a);
}

function fillCircle(cx, cy, radius, r, g, b, a = 255) {
    const r2 = radius * radius;
    for (let y = -Math.ceil(radius); y <= Math.ceil(radius); y++) {
        for (let x = -Math.ceil(radius); x <= Math.ceil(radius); x++) {
            const d2 = x * x + y * y;
            if (d2 <= r2) {
                // Anti-alias edge
                const d = Math.sqrt(d2);
                let alpha = a;
                if (d > radius - 1) {
                    alpha = Math.round(a * (radius - d));
                    if (alpha < 0) alpha = 0;
                }
                setPixel(cx + x, cy + y, r, g, b, alpha);
            }
        }
    }
}

function strokeCircle(cx, cy, radius, w, r, g, b, a = 255) {
    const inner = radius - w;
    const outer = radius;
    for (let y = -Math.ceil(outer); y <= Math.ceil(outer); y++) {
        for (let x = -Math.ceil(outer); x <= Math.ceil(outer); x++) {
            const d = Math.sqrt(x * x + y * y);
            if (d <= outer && d >= inner - 1) {
                let alpha = a;
                if (d > outer - 1) {
                    alpha = Math.round(a * (outer - d));
                    if (alpha < 0) alpha = 0;
                } else if (d < inner) {
                    alpha = Math.round(a * (d - inner + 1));
                    if (alpha < 0) alpha = 0;
                }
                setPixel(cx + x, cy + y, r, g, b, alpha);
            }
        }
    }
}

function drawLine(x0, y0, x1, y1, w, r, g, b, a = 255) {
    // Bresenham with thickness
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const steps = Math.max(dx, dy);
    if (steps === 0) {
        fillCircle(Math.round(x0), Math.round(y0), Math.floor(w / 2), r, g, b, a);
        return;
    }
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        fillCircle(Math.round(x), Math.round(y), Math.floor(w / 2), r, g, b, a);
    }
}

function fillRoundedRect(x0, y0, x1, y1, radius, r, g, b, a = 255) {
    // Fill center
    fillRect(x0 + radius, y0, x1 - radius, y1, r, g, b, a);
    fillRect(x0, y0 + radius, x1, y1 - radius, r, g, b, a);
    // Corners
    fillCircle(x0 + radius, y0 + radius, radius, r, g, b, a);
    fillCircle(x1 - radius, y0 + radius, radius, r, g, b, a);
    fillCircle(x0 + radius, y1 - radius, radius, r, g, b, a);
    fillCircle(x1 - radius, y1 - radius, radius, r, g, b, a);
}

function strokeRoundedRect(x0, y0, x1, y1, radius, w, r, g, b, a = 255) {
    // Top edge
    fillRect(x0 + radius, y0, x1 - radius, y0 + w - 1, r, g, b, a);
    // Bottom edge
    fillRect(x0 + radius, y1 - w + 1, x1 - radius, y1, r, g, b, a);
    // Left edge
    fillRect(x0, y0 + radius, x0 + w - 1, y1 - radius, r, g, b, a);
    // Right edge
    fillRect(x1 - w + 1, y0 + radius, x1, y1 - radius, r, g, b, a);
    // Corners (arc segments)
    const cornerR = radius;
    // Top-left
    for (let ang = 135; ang <= 225; ang += 2) {
        const rad = ang * Math.PI / 180;
        for (let dw = 0; dw < w; dw++) {
            const cx = x0 + cornerR;
            const cy = y0 + cornerR;
            const px = Math.round(cx + (cornerR - dw) * Math.cos(rad));
            const py = Math.round(cy + (cornerR - dw) * Math.sin(rad));
            setPixel(px, py, r, g, b, a);
        }
    }
    // Top-right
    for (let ang = -45; ang <= 45; ang += 2) {
        const rad = ang * Math.PI / 180;
        for (let dw = 0; dw < w; dw++) {
            const cx = x1 - cornerR;
            const cy = y0 + cornerR;
            const px = Math.round(cx + (cornerR - dw) * Math.cos(rad));
            const py = Math.round(cy + (cornerR - dw) * Math.sin(rad));
            setPixel(px, py, r, g, b, a);
        }
    }
    // Bottom-left
    for (let ang = 45; ang <= 135; ang += 2) {
        const rad = ang * Math.PI / 180;
        for (let dw = 0; dw < w; dw++) {
            const cx = x0 + cornerR;
            const cy = y1 - cornerR;
            const px = Math.round(cx + (cornerR - dw) * Math.cos(rad));
            const py = Math.round(cy + (cornerR - dw) * Math.sin(rad));
            setPixel(px, py, r, g, b, a);
        }
    }
    // Bottom-right
    for (let ang = 225; ang <= 315; ang += 2) {
        const rad = ang * Math.PI / 180;
        for (let dw = 0; dw < w; dw++) {
            const cx = x1 - cornerR;
            const cy = y1 - cornerR;
            const px = Math.round(cx + (cornerR - dw) * Math.cos(rad));
            const py = Math.round(cy + (cornerR - dw) * Math.sin(rad));
            setPixel(px, py, r, g, b, a);
        }
    }
}

// ===== Draw the icon =====
// Brand colors
const C_PRIMARY = [125, 207, 255];   // #7dcfff light cyan
const C_RED = [247, 118, 142];       // #f7768e
const C_YELLOW = [224, 175, 104];    // #e0af68
const C_GREEN = [158, 206, 106];     // #9ece6a
const C_TEXT = [192, 202, 245];      // #c0caf5
const C_BRANCH = [158, 206, 106];    // green for branch nodes

// Terminal window geometry
const WIN_X0 = 14, WIN_Y0 = 20, WIN_X1 = 114, WIN_Y1 = 108;
const WIN_RADIUS = 8;
const TITLE_H = 12;
const STROKE = 3;

// 1. Terminal window border (rounded rect)
strokeRoundedRect(WIN_X0, WIN_Y0, WIN_X1, WIN_Y1, WIN_RADIUS, STROKE, C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2]);

// 2. Title bar separator line
fillRect(WIN_X0 + WIN_RADIUS, WIN_Y0 + TITLE_H, WIN_X1 - WIN_RADIUS, WIN_Y0 + TITLE_H + 1, C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2], 180);

// 3. Title bar dots (mac-style traffic lights)
fillCircle(WIN_X0 + 12, WIN_Y0 + 6, 2.5, C_RED[0], C_RED[1], C_RED[2]);
fillCircle(WIN_X0 + 22, WIN_Y0 + 6, 2.5, C_YELLOW[0], C_YELLOW[1], C_YELLOW[2]);
fillCircle(WIN_X0 + 32, WIN_Y0 + 6, 2.5, C_GREEN[0], C_GREEN[1], C_GREEN[2]);

// 4. Terminal text lines (3 lines, like code)
const TEXT_X = WIN_X0 + 10;
const TEXT_W = 38;
fillRect(TEXT_X, WIN_Y0 + 24, TEXT_X + TEXT_W, WIN_Y0 + 26, C_TEXT[0], C_TEXT[1], C_TEXT[2]);
fillRect(TEXT_X, WIN_Y0 + 32, TEXT_X + 28, WIN_Y0 + 34, C_TEXT[0], C_TEXT[1], C_TEXT[2], 200);
fillRect(TEXT_X, WIN_Y0 + 40, TEXT_X + 34, WIN_Y0 + 42, C_TEXT[0], C_TEXT[1], C_TEXT[2], 180);

// 5. Git branch icon (right side of terminal, overlapping)
// A vertical line with a node, and a branch line going up-right
const BRANCH_CX = 88;
const BRANCH_CY = 78;

// Main vertical branch line (bottom node to top)
drawLine(BRANCH_CX, BRANCH_CY + 12, BRANCH_CX, BRANCH_CY - 14, 3, C_BRANCH[0], C_BRANCH[1], C_BRANCH[2]);

// Branch arm (curve up-right) - approximate with line segments
const armEndX = BRANCH_CX + 16;
const armEndY = BRANCH_CY - 14;
drawLine(BRANCH_CX, BRANCH_CY, armEndX, armEndY, 3, C_BRANCH[0], C_BRANCH[1], C_BRANCH[2]);

// Bottom node (commit)
fillCircle(BRANCH_CX, BRANCH_CY + 14, 5, C_BRANCH[0], C_BRANCH[1], C_BRANCH[2]);
strokeCircle(BRANCH_CX, BRANCH_CY + 14, 5, 2, 26, 27, 38); // dark inner

// Top node (main branch tip)
fillCircle(BRANCH_CX, BRANCH_CY - 14, 5, C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2]);
strokeCircle(BRANCH_CX, BRANCH_CY - 14, 5, 2, 26, 27, 38);

// Arm tip node (branch tip)
fillCircle(armEndX, armEndY, 5, C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2]);
strokeCircle(armEndX, armEndY, 5, 2, 26, 27, 38);

// ===== Encode PNG =====
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (0xEDB88320 & (-(crc & 1)));
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    const crcData = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// PNG signature
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);  // width
ihdr.writeUInt32BE(SIZE, 4);  // height
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type: RGBA
ihdr[10] = 0;  // compression
ihdr[11] = 0;  // filter
ihdr[12] = 0;  // interlace

// IDAT - raw scanlines with filter byte 0 per row
const rowSize = SIZE * 4;
const raw = Buffer.alloc((rowSize + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
    raw[y * (rowSize + 1)] = 0; // filter: none
    for (let x = 0; x < rowSize; x++) {
        raw[y * (rowSize + 1) + 1 + x] = pixels[y * rowSize + x];
    }
}
const idatData = zlib.deflateSync(raw, { level: 9 });

// IEND
const iend = Buffer.alloc(0);

const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', iend)
]);

const outPath = path.join(__dirname, 'resources', 'icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log(`PNG icon generated: ${outPath} (${png.length} bytes)`);
