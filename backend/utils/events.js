const { EventEmitter } = require('events');

const appEvents = new EventEmitter();

function emitDashboardRefresh(payload = {}) {
  appEvents.emit('dashboard:refresh', {
    at: new Date().toISOString(),
    ...payload,
  });
}

function emitInventoryRefresh(payload = {}) {
  appEvents.emit('inventory:refresh', {
    at: new Date().toISOString(),
    ...payload,
  });
}

module.exports = {
  appEvents,
  emitDashboardRefresh,
  emitInventoryRefresh,
};
