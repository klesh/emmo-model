var base = require('./base.js');
var mysql = require('mysql');
var Connection = require('mysql/lib/Connection');
var P = require('bluebird');
var util = require('util');
var urlParse = require('url').parse;
const {merge} = require('../lib/functions.js');

P.promisifyAll(mysql);
P.promisifyAll(Connection.prototype);

merge(module.exports, base, {
  /**
   * Default database came with RDBMS server,
   * This is used to be connected for CREATE/DROP our databases.
   *
   * @type {string}
   */
  defaultDatabase: 'mysql',

  /**
   * AUTO_INCREMENT column keyword, some RDBMS doesn't have one (like postgres)
   *
   * @type {string}
   */
  autoIncrement: 'AUTO_INCREMENT',

  /**
   * Indicate AUTO_INCRMENT column must be with PRIMARY KEY declaration.
   */
  autoPrimaryKey: 'PRIMARY KEY',

  /**
   * String concatenate operator(string), or CONCAT function(function) if RDBMS doesn't have one.
   *
   * @type {string|function}
   */
  stringConcatenate: function() {
    var args = Array.from(arguments);
    return function(builder) {
      return "CONCATE_WS('', " + args.map(function(arg) {
        return builder.element(arg);
      }) + ")";
    };
  },

  /**
   * Return quoted Database Object name
   *
   * @example
   *   quote('User') => `User`
   *
   * @type {function}
   * @param {string} name
   * @return {string}
   */
  quote: function(name) {
    return '`' + name + '`';
  },

  /**
   * Return last inserted id value
   *
   * @type {function}
   * @prama {Connection} connection
   * @return {Promise<number>}
   */
  getInsertId: function(result) {
    return P.resolve(result.insertId);
  },


  /**
   * mysql's query method invoke callback with 3 arguments(err, rows, something), thus r will be an array as in [rows, something]
   */
  result: function(r) {
    return r[0];
  },
  
  /**
   * using text to simulate json/jsonb data type
   */
  columnType: function(columnDef) {
    switch (columnDef.type) {
      case 'bool':
        return 'tinyint(1)';
      case 'tinyint':
      case 'smallint':
      case 'int':
      case 'integer':
      case 'bigint':
        var length = columnDef.length || 10;
        var statement = columnDef.type + '(' + length + ')';
        if (columnDef.unsigned)
          statement += ' unsigned';
        return statement;
      case 'real':
      case 'double':
      case 'float':
      case 'decimal':
      case 'numeric':
        var statement = base.columnType(columnDef);
        if (columnDef.unsigned)
          statement += ' unsigned';
        return statement;
      default:
        return base.columnType(columnDef);
    }
  },

  /**
   * Obtain a connection from pool
   *
   * @type {function}
   * @param {string} connectionString
   * @return {Promise<Connection>}
   */
  connect: function(connectionString) {
    // create pools if doesn't exists
    if (this.pools === undefined)
      this.pools = {};

    // create pool if doesn't exists
    if (this.pools[connectionString] === undefined) {
      var options = urlParse(connectionString);
      var auth = options.auth.split(':');
      this.pools[connectionString] = P.promisifyAll(mysql.createPool({
        connectionLimit: this.config.poolSize || 10,
        host: options.hostname,
        port: options.port,
        database: options.pathname.substr(1),
        user: auth[0],
        password: auth[1],
        multipleStatements: true
      }));
    }

    // pick one from pool
    return this.pools[connectionString].getConnectionAsync().then(function(connection) {
      // wrap it up for spread function
      return [ 
        connection, // first argument: connection
        function() { // second argument: release
          connection.release();
        } 
      ];
    });
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
    if (!this.pools)
      return P.resolve();

    var pools = this.pools;
    delete this.pools;

    return P.map(Object.values(pools), function(pool, connectionString) {
      return pool.endAsync();
    });
  },
  renameTable: function(oldName, newName) {
    return util.format('ALTER TABLE %s RENAME %s', 
                      this.quote(oldName),
                      this.quote(newName)) + this.separator;
  },
  createPrimaryKey: function(tableName, primaryKeysInfo, modelDef) {
    const hasAutoIncrement = primaryKeysInfo.columns.find(cn => modelDef.columns.find(c => c.columnName === cn).autoIncrement);
    if (hasAutoIncrement) return '';
    return util.format('ALTER TABLE %s ADD PRIMARY KEY (%s)',
                      this.quote(tableName),
                      this.joinColumns(primaryKeysInfo.columns)) + this.separator;
  },
  dropPrimaryKey: function(tableName, primaryKeysInfo) {
    return util.format('ALTER TABLE %s DROP PRIMARY KEY', this.quote(tableName)) + this.separator;
  },
  createTable: function(tableName, tableDef) {
    var tableOptions = tableDef.tableOptions || {};
    var engine = tableOptions.engine || 'InnoDB';
    var charset = tableOptions.charset || 'utf8';

    return util.format('CREATE TABLE %s (\n%s\n) ENGINE=%s DEFAULT CHARSET=%s', 
                       this.quote(tableName), 
                       this.columns(tableDef),
                       engine,
                       charset
                      ) + this.separator;
  },
  changeColumnType: function(tableName, columnName, columnDef) {
    return util.format('ALTER TABLE %s MODIFY COLUMN %s %s',
                      this.quote(tableName),
                      this.quote(columnName),
                      this.columnType(columnDef)) + this.separator;

  },
  changeColumnDefaultValue: function(tableName, columnName, columnDef) {
    return util.format('ALTER TABLE %s MODIFY COLUMN %s %s DEFAULT %s',
                      this.quote(tableName),
                      this.quote(columnName),
                      this.columnType(columnDef),
                      columnDef.defaultValue === null || columnDef.defaultValue === undefined ? 'NULL' : columnDef.defaultValue) + this.separator;
  },
  renameColumn: function(tableName, oldName, newName, columnDef) {
    return util.format('ALTER TABLE %s CHANGE COLUMN %s %s %s',
                      this.quote(tableName),
                      this.quote(oldName),
                      this.quote(newName),
                      this.columnType(columnDef)) + this.separator;
  },
  renameIndex: function(oldName, newName, tableName) {
    return util.format('ALTER TABLE %s RENAME INDEX %s TO %s',
                      this.quote(tableName),
                      this.quote(oldName),
                      this.quote(newName)) + this.separator;
  },
  dropIndex: function(tableName, name) {
    return util.format('ALTER TABLE %s DROP INDEX %s',
                      this.quote(tableName),
                      this.quote(name)) + this.separator;
  },
  functions: {
    ymd: function(resource) {
      return function(builder) {
        return 'DATE_FORMAT(' + builder.quote(resource) + ", '%Y-%m-%d')";
      };
    }
  }
});
