import { runFixture } from './fiscal-fixture-lib.mjs';
runFixture('cleanup').then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
