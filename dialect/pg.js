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
  returnId: function(connection) {
    return this.query(connection, "SELECT LASTVAL()").then(function(result) {
      return result.rows[0].lastval;
    });
  },
  columnType: function(columnDef) {
    if (columnDef.autoIncrement)
      return columnDef.type == 'int' ? 'serial' : 'bigserial';
    
    if (columnDef.type == 'float')
      return 'real';

    return base.columnType(columnDef);
  },
  // return a promise connection instance
  connect: function(connectionString) {
    return pg.connectAsync(connectionString);
  },
  // return a query promise
  query: function(connection, sqlScript, sqlParams) {
    return connection.queryAsync(sqlScript, sqlParams);
  },
  // dispose all pooled connection
  dispose: function() {
    return pg.end();
  }
});
