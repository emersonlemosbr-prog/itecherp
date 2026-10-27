const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function getListenConfig(env = process.env) {
  const port = Number(env.PUBLIC_PORT || 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === Number(env.PORT || 3001)) {
    throw new Error('PUBLIC_PORT deve ser uma porta entre 1 e 65535 diferente da porta administrativa.');
  }
  return { port, host: '0.0.0.0' };
}

module.exports = { getListenConfig };
