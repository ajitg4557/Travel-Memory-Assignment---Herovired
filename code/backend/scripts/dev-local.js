// Laptop-only helper: runs the whole app on http://localhost:5000
// WITHOUT Docker, Nginx or a MongoDB account.
// It starts a temporary in-memory MongoDB (data is lost when you stop it),
// then starts server.js with SERVE_FRONTEND=true.
//
//   cd backend
//   npm install
//   npm run dev:local
//
// For the real lab use MongoDB Atlas (set MONGO_URI in .env and run `npm start`).
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  console.log('Starting temporary in-memory MongoDB (first run downloads ~100 MB, please wait)...');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('taskboard');
  process.env.SERVE_FRONTEND = 'true';
  process.env.ENABLE_STRESS = process.env.ENABLE_STRESS || 'true';
  process.env.APP_ENV = process.env.APP_ENV || 'laptop';
  console.log(`In-memory MongoDB ready: ${process.env.MONGO_URI}`);
  require('../server');
  console.log('\n  Open http://localhost:5000 in your browser\n');
  const stop = async () => { await mongod.stop(); process.exit(0); };
  process.on('SIGINT', stop);
})();
