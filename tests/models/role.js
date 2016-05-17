var em = require('../../index.js');

module.exports = em.define('Role', {
  id: { type: 'int', primaryKey: true, autoIncrement: true },
  name: { type: 'string', length: 50, unique: true, allowNull: false },
  permission: { type: 'string' },
  created_at: { type: 'datetime', defaultValue: 'now()' }
});

