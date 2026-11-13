import {readFile} from 'node:fs/promises';
import {prepareGymBatch} from '../packages/gym-directory/prepare.mjs';

const [input,manifest]=process.argv.slice(2);
if (!input || !manifest) throw new Error('Usage: node tools/prepare-gyms.mjs records.json municipalities.json');
const [records,cities]=await Promise.all([input,manifest].map(async file=>JSON.parse(await readFile(file,'utf8'))));
console.log(JSON.stringify(prepareGymBatch(records,cities),null,2));
