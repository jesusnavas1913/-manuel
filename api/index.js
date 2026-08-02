// Vercel serverless entry point
// Carga variables de entorno desde backend/.env (desarrollo local)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

module.exports = require('../backend/server.js');
