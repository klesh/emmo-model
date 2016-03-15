var _ = require('lodash');
var base = require('./base.js');
var mysql = require('mysql');
var Promise2 = require('bluebird');
var util = require('util');
var urlParse = require('url').parse;

Promise2.promisifyAll(mysql);

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
    }
  },

  /**
   * A query parameter placholder in SQL statement
   *
   * @example
   *   placehold(1) => $2  // pg
   *   placehold(1) => ?   // mysql
   *
   * @type {function}
   * @param {number} index
   * @return {string}
   */
  placehold: function(index) {
    return '$' + (index * 1 + 1);
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
  returnId: function(connection) {
    return this.query(connection, "SELECT LAST_INSERT_ID()").then(function(result) {
      return result.rows[0].lastval;
    });
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
      this.pools[connectionString] = P.primisifyAll(mysql.createPool({
        connectionLimit: this.config.poolSize || 10,
        host: options.hostname,
        port: options.port,
        database: options.pathname.substr(1),
        user: auth[0],
        password: auth[1]
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
    return P.map(this.pools, function(pool) {
      return pool.endAsync();
    });
  }
});
