import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import JavaScriptObfuscator from 'javascript-obfuscator';

// Preserve the upstream obfuscation settings.
const obfuscationOptions = {
    seed: 1, // Keep generated files reproducible.
    compact: true,
    controlFlowFlattening: false,
    controlFlowFlatteningThreshold: 0,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 1.0,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: false,
    stringArrayWrappersParametersMaxCount: 3,
    renameGlobals: true,
    identifierNamesGenerator: 'mangled-shuffled',
    identifierNamesCache: null,
    identifiersPrefix: '',
    renameProperties: false,
    renamePropertiesMode: 'safe',
    ignoreImports: false,
    target: 'browser',
    numbersToExpressions: false,
    simplify: false,
    splitStrings: true,
    splitStringsChunkLength: 1,
    transformObjectKeys: false,
    unicodeEscapeSequence: true,
    selfDefending: false,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: false,
    domainLock: []
};

const file = '少年你相信光吗';
const source = await readFile('明文源吗', 'utf8');
const code = JavaScriptObfuscator.obfuscate(source, obfuscationOptions).getObfuscatedCode();
if (process.argv.includes('--check')) {
  assert.equal(await readFile(file, 'utf8'), code, file + ' is out of date; run npm run obfuscate');
} else {
  await writeFile(file, code);
}
