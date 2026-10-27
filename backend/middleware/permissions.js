const rules = {
  customers: 'customers', 'service-orders': 'orders', warranties: 'warranties',
  inventory: 'inventory', 'store-sales': 'store_sales', 'device-sales': 'device_sales',
  'credit-accounts': 'credits', notes: 'notes', 'virus-agent': 'android'
};
function authorize(req, res, next) {
  if (req.user.role === 'admin') return next();
  const area = req.baseUrl.split('/')[2];
  const permission = rules[area];
  if (permission && !req.user.permissions[permission])
    return res.status(403).json({ error: 'Você não tem permissão para esta área.' });
  next();
}
module.exports = { authorize };
