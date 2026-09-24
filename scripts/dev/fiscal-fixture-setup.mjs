import { runFixture } from './fiscal-fixture-lib.mjs';
runFixture('setup', process.argv[2]).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
