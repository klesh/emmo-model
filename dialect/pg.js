var base = require('./base.js');
var pg = require('pg');
var P = require('bluebird');
var util = require('util');
const {merge} = require('../lib/functions.js');

P.promisifyAll(pg);

merge(module.exports, base, {
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

  /**
   * should be implemented in dialect implementation.
   *
   * @param {any}    dialectResult   returned by dialect query method
   * @returns {Result}
   */
  result: function(dialectResult) {
    dialectResult.rows.affectedRows = dialectResult.rowCount;
    return dialectResult.rows;
  },
  wrapInsertSql: function(sql, builder) {
    if (builder.entity.autoIncrementName)
      return sql + " RETURNING " + this.quote(builder.entity.autoIncrementName);
    return sql;
  },
  getInsertId: function(result, builder, session) {
    return P.resolve(result[0][builder.entity.autoIncrementName]);
  },
  columnType: function(columnDef) {
    if (columnDef.autoIncrement)
      return columnDef.type == 'int' ? 'serial' : 'bigserial';

    switch (columnDef.type) {
      case 'float':
        return 'real';
      case 'datetime':
        return 'timestamptz';
    }

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
    pg.end();
    return P.resolve();
  },

  comparators: {
    like: function like(str, type) {
      return function(builder) {
        if (type === 'raw') {
          return ' LIKE ' + builder.value(str);
        }
        var esc = '';
        if (str.indexOf('%') >= 0) {
          esc = " ESCAPE '\\'";
          str = str.replace(/%/g, '\\%');
        }
        if (type === 'start')
          str += '%';
        else if (type == 'end')
          str = '%' + str;
        else
          str = '%' + str + '%';
        return ' ILIKE ' + builder.value(str) + esc;
      };
    },
  },

  functions: {
    ymd: function(resource) {
      return function(builder) {
        return 'to_char(' + builder.quote(resource) + ", 'YYYY-MM-DD')";
      };
    }
  }
});
