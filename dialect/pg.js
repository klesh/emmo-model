var _ = require('lodash');
var base = require('./base.js');
var pg = require('pg');
var Promise = require('bluebird');
var util = require('util');

Promise.promisifyAll(pg);

_.extend(module.exports, base, {
  defaultDatabase: 'postgres',
  placehold: function(index) {
    return '$' + (index * 1 + 1);
  },
  quote: function(name) {
    return '"' + name + '"';
  },
//  dropDatabase: function(name) {
//    return util.format("SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '%s' AND pid <> pg_backend_pid();", name) + "\n" + base.dropDatabase(name);
//  
//  },
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
  // return a promise query instance
  query: function(connection, sqlScript, sqlParams) {
    return connection.queryAsync(sqlScript, sqlParams);
  }
});
