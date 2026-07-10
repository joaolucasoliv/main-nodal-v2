import { createDatabase, defaultDatabasePath } from '../server/db.js';

const db = createDatabase();
db.close();
console.log(`migrations applied: ${defaultDatabasePath()}`);
