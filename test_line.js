// 测试有问题的行
const testCode = `
function renderBranchList(list) {
    const container = document.getElementById('branchList');
    container.innerHTML = list.map(b => {
        const isCurrent = b === currentBranch;
        return '<div' + (isCurrent ? ' class="current"' : '') + ' onclick="selectBranch(\\'' + b + '\\')">' + b + '</div>';
    }).join('');
}
`;

console.log('Test code:');
console.log(testCode);
console.log('---');

try {
    new Function(testCode);
    console.log('✅ Syntax OK');
} catch (e) {
    console.log('❌ Syntax error:', e.message);
}
