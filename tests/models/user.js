var em = require('../../index.js');

module.exports = em.define('User', {
  id: { type: 'int', primaryKey: true, autoIncrement: true },
  nick: { type: 'string', length: 50, unique: true, allowNull: false },
  password: { type: 'string', virtual: true, isLength: [ { min:7, max: 20 } ] },
  passwordHash: { columnName: 'password', type: 'string', length: 50, input: false },
  isAdmin: { type: 'bool' },
  age: { type: 'int' },
  email: { type: 'string', length: 100, validate: { isEmail: true }},
  departmentId: { type: 'int', refer: 'Department', onDelete: 'SET NULL' },
  createdAt: { type: 'timestamptz', defaultValue: 'now()' },
  updatedAt: { type: 'timestamptz' }
});
