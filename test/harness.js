'use strict';
const assert = require('assert');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('  ok - ' + name);
    } catch (err) {
        failed++;
        failures.push({ name, err });
        console.log('  FAIL - ' + name);
        console.log('    ' + String(err.message).split('\n').join('\n    '));
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log('  ok - ' + name);
    } catch (err) {
        failed++;
        failures.push({ name, err });
        console.log('  FAIL - ' + name);
        console.log('    ' + String(err.message).split('\n').join('\n    '));
    }
}

function summary(suite) {
    console.log('\n' + suite + ': ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) {
        process.exitCode = 1;
    }
    return { passed, failed };
}

function freshRequire(modulePath) {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
    return require(resolved);
}

module.exports = { assert, test, testAsync, summary, freshRequire };
