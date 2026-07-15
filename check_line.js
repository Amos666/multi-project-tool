const fs = require('fs');
const content = fs.readFileSync('Z:/workspace/multi-project-tool/_full_js_test.js', 'utf8');
const lines = content.split('\n');
console.log('Line 132 (raw):', JSON.stringify(lines[131]));
