var _ = require('lodash');
var base = require('./base.js');
var mysql = require('mysql');
var Connection = require('mysql/lib/Connection');
var P = require('bluebird');
var util = require('util');
var urlParse = require('url').parse;

P.promisifyAll(mysql);
P.promisifyAll(Connection.prototype);

_.merge(module.exports, base, {
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
    var args = _.toArray(arguments);
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
        return 'tinyint';
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

    return P.map(_.values(pools), function(pool, connectionString) {
      return pool.endAsync();
    });
  },

  createPrimaryKey: function(tableName, primaryKeysInfo, modelDef) {
    var hasAutoIncrement = _.some(primaryKeysInfo.columns, function(columnName) {
      return modelDef.columns[columnName].autoIncrement;
    });
    if (hasAutoIncrement) return '';
    return util.format('ALTER TABLE %s ADD PRIMARY KEY (%s)',
                      this.quote(tableName),
                      this.joinColumns(primaryKeysInfo.columns)) + this.separator;
  },
  dropPrimaryKey: function(tableName, primaryKeysInfo) {
    return util.format('ALTER TABLE %s DROP PRIMARY KEY', this.quote(tableName)) + this.separator;
  }
});
