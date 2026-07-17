// 测试模板字符串中的转义
const test1 = `\'`;
console.log("test1 (\\'):", JSON.stringify(test1));

const test2 = `\\'`;
console.log("test2 (\\\\'):", JSON.stringify(test2));

const test3 = `'`;
console.log("test3 ('):", JSON.stringify(test3));
