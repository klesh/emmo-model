var em = require('../../index.js');

module.exports = em.define('Department', {
  id: { type: 'int', primaryKey: true, autoIncrement: true },
  nick: { type: 'string', unique: true, allowNull: false }
});

