const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/views/MainViewProvider.ts');
const content = fs.readFileSync(filePath, 'utf8');

const startMarker = 'private getJavaScript(): string {';
const endMarker = '    private handleInit(): void {';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

let jsFunc = content.substring(startIdx, endIdx);

const returnStart = jsFunc.indexOf('return `');
const returnEnd = jsFunc.lastIndexOf('`;');

let jsCode = jsFunc.substring(returnStart + 8, returnEnd);
jsCode = jsCode.trim();

// 输出到文件
const outFile = path.join(__dirname, '_full_js_test.js');
fs.writeFileSync(outFile, jsCode, 'utf8');

console.log('Written to', outFile);
console.log('Total lines:', jsCode.split('\n').length);

// 用 node --check 检查
const { execSync } = require('child_process');
try {
    execSync(`node --check "${outFile}"`, { stdio: 'pipe' });
    console.log('✅ Full JS syntax is valid!');
} catch (e) {
    console.log('❌ JS syntax error:');
    console.log(e.stderr.toString());
}
