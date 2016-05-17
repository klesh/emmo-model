var em = require('../../index.js');

module.exports = em.define('Department', {
  id: { type: 'int', primaryKey: true, autoIncrement: true },
  title: { type: 'string', length: 50, unique: true, allowNull: false }
});

