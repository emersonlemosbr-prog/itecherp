const { nextNumber } = require('../services/settings');
module.exports = { nextOrderNumber: (storeId = 1) => nextNumber('order', storeId) };
