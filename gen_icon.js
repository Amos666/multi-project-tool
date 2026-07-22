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
// 与 icon.svg 保持一致的几何设计：主分支主干 + 分叉臂 + 3 节点 + 底部堆叠文件线
// Brand colors
const C_PRIMARY = [125, 207, 255];   // #7dcfff light cyan
const C_GREEN = [158, 206, 106];     // #9ece6a
const C_TEXT = [192, 202, 245];      // #c0caf5
const C_MUTED = [134, 143, 178];     // 文件线弱化色

// SVG viewBox 24x24 映射到 128x128，留 8px 边距 → 实际绘制区 [16,112] x [16,112]
// 缩放系数: 128/24 ≈ 5.333
function sx(v) { return 16 + v * 5.333; }  // 不使用，改用更宽松的布局
const S = 128 / 24;
const OX = 0, OY = 0;  // 直接缩放，因为 viewBox 没有留白
function X(v) { return Math.round(OX + v * S); }
function Y(v) { return Math.round(OY + v * S); }

// 主分支主干：x=6, y=4 → y=14.5
const STROKE_W = Math.max(3, Math.round(1.6 * S * 0.85));  // 适配 RGBA 像素，略细
drawLine(X(6), Y(4), X(6), Y(14.5), STROKE_W, C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2]);

// 分叉臂：从 (6,14.5) 曲线到 (12,10.5)
// 用多段直线近似贝塞尔曲线
const segs = 16;
let prevX = X(6), prevY = Y(14.5);
for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    // 近似 SVG 路径 "c3 0 3-4 6-4" 的贝塞尔
    const cx = 6 + 3 * t;
    const cy = 14.5 + (-4) * t * t;  // 简化的曲线
    const nx = X(cx), ny = Y(cy);
    drawLine(prevX, prevY, nx, ny, STROKE_W, C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2]);
    prevX = nx; prevY = ny;
}

// 节点半径（SVG r=1.6，像素化需稍大避免锯齿）
const NODE_R = Math.max(4, Math.round(1.6 * S * 0.95));

// 主分支顶端节点 (6, 5) - 绿色
fillCircle(X(6), Y(5), NODE_R, C_GREEN[0], C_GREEN[1], C_GREEN[2]);

// 分叉臂顶端节点 (12, 10.5) - 绿色
fillCircle(X(12), Y(10.5), NODE_R, C_GREEN[0], C_GREEN[1], C_GREEN[2]);

// 主分支底端节点 (6, 19.5) - 主色
fillCircle(X(6), Y(19.5), NODE_R, C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2]);

// 底部堆叠文件线（多项目概念）
// 三条水平线，透明度递减
const FILE_X0 = X(11.5), FILE_X1 = X(20.5);
const FILE_W = STROKE_W - 1;
fillRect(FILE_X0, Y(16.5) - Math.floor(FILE_W/2), FILE_X1, Y(16.5) + Math.floor(FILE_W/2), C_TEXT[0], C_TEXT[1], C_TEXT[2], 255);
fillRect(FILE_X0, Y(19.5) - Math.floor(FILE_W/2), FILE_X1, Y(19.5) + Math.floor(FILE_W/2), C_TEXT[0], C_TEXT[1], C_TEXT[2], 255);
fillRect(FILE_X0, Y(22.5) - Math.floor(FILE_W/2), FILE_X1, Y(22.5) + Math.floor(FILE_W/2), C_TEXT[0], C_TEXT[1], C_TEXT[2], 140);

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
