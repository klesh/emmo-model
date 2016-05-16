var _ = require('lodash');
var base = require('./base.js');
var pg = require('pg');
var Promise2 = require('bluebird');
var util = require('util');

Promise2.promisifyAll(pg);

_.merge(module.exports, base, {
  defaultDatabase: 'postgres',
  autoIncrement: '',
  stringConcatenate: '||',
  databaseExists: function(database) {
    return "SELECT 1 from pg_database WHERE datname='" + this.quoteString(database) + "'";
  },
  placehold: function(index) {
    return '$' + (index * 1 + 1);
  },
  quote: function(name) {
    return '"' + name + '"';
  },
  wrapInsertSql: function(sql, builder) {
    if (builder.entity.autoIncrementName)
      return sql + " RETURNING " + this.quote(builder.entity.autoIncrementName);
    return sql;
  },
  getInsertId: function(result, builder, session) {
    return Promise2.resolve(result[0][builder.entity.autoIncrementName]);
  },
  columnType: function(columnDef) {
    if (columnDef.autoIncrement)
      return columnDef.type == 'int' ? 'serial' : 'bigserial';
    
    if (columnDef.type == 'float')
      return 'real';

    return base.columnType(columnDef);
  },
  
  /**
   * Obtain a connection from pool
   *
   * @type {function}
   * @param {string} connectionString
   * @return {Promise<Connection>}
   */
  connect: function(connectionString) {
    return pg.connectAsync(connectionString);
  },

  /**
   * Run database query
   *
   * @param {Connection}  connection
   * @param {string}      sqlScript
   * @param {array}       sqlParams
   */
  query: function(connection, sqlScript, sqlParams) {
    return connection.queryAsync(sqlScript, sqlParams);
  },

  /**
   * Dispose pools, might be needed for DROPing database
   * 
   * return {Promise}
   */
  dispose: function() {
    return pg.end();
  }
});
