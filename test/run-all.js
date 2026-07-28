'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
    'migration.test.js',
    'configStore.test.js',
    'pythonStore.test.js',
    'webview.test.js'
];

let allOk = true;
const results = [];

for (const suite of suites) {
    const file = path.join(__dirname, suite);
    console.log('\n=== ' + suite + ' ===');
    const res = spawnSync(process.execPath, [file], { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' } });
    const ok = res.status === 0;
    if (!ok) { allOk = false; }
    results.push({ suite, ok, status: res.status });
}

console.log('\n==========================');
for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.suite);
}
console.log('==========================');
console.log(allOk ? 'All test suites passed.' : 'Some test suites FAILED.');
process.exit(allOk ? 0 : 1);
