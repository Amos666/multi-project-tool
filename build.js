const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 清理之前的构建文件
console.log('Cleaning previous build...');
if (fs.existsSync('out')) {
    fs.rmSync('out', { recursive: true, force: true });
}

// 编译TypeScript
console.log('Compiling TypeScript...');
execSync('npm run compile', { stdio: 'inherit' });

// 创建必要的目录
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// 复制必要文件
console.log('Copying necessary files...');
const filesToCopy = [
    'package.json',
    'README.md',
    'LICENSE'
];

filesToCopy.forEach(file => {
    const source = path.join(__dirname, file);
    const dest = path.join(distDir, file);
    if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest);
    }
});

console.log('Build completed successfully!');
console.log('You can now test the extension by pressing F5 in VSCode.');
console.log('To create a VSIX package, run: npm run package');