var em = require('../../index.js');

module.exports = em.define('UserRole', {
  userId: { type: 'int', refer: 'User', primaryKey: true, onDelete: 'CASCADE' },
  roleId: { type: 'int', refer: 'Role', primaryKey: true, onDelete: 'CASCADE' }
});
