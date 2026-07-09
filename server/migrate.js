import { createDatabase, defaultDatabasePath } from './db.js';

const db = createDatabase();
db.close();
console.log(`migrations applied: ${defaultDatabasePath()}`);
