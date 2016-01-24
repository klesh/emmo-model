var fs = require('fs');
var path = require('path');
var util = require('util');
var _ = require('lodash');
var normalizeDef = require('./lib/norm-definition.js');
var Session = require('./lib/session.js');
var Migrator = require('./lib/migrator.js');
var Sql = require('./lib/sql-generator.js');
var createModel = require('./lib/create-model.js');
var Expression = require('./lib/expression.js');
var Promise2 = require('bluebird');
var EventEmitter = require('events');
Promise2.longStackTraces();

/**
 * EmmoModel holds Model/Table definitions, and a Database Server for you.
 * <p>EmmoModel is a EventEmitter, you can subscribe events by once/on</p>
 * @constructor
 */
function EmmoModel() {
  // initialize definition, add _Migration model to store model definition.
  EventEmitter.call(this);
  this.models = {};
  this.definition = {};
  this.define('_Migration', {
    uid: { type: 'bigint', primaryKey: true, allowNull: false },
    name: { type: "string", length: 50, unique: true }, 
    models: { type: "string" }
  });
}

util.inherits(EmmoModel, EventEmitter);


/**
 * @typedef Column
 * @type {object}
 * @property {string}           type
 * @property {number}          [length]
 * @property {string}          [defaultValue]     if you want a default string for column remember use string quote "'STRING'"
 * @property {boolean}         [allowNull=true] 
 * @property {boolean}         [primaryKey=false]
 * @property {string|boolean}  [index]            assign same index name to multiple columns to create a composite index
 * @property {boolean}         [unique]           create a unique index or set existing index to unique
 * @property {string}          [refer]            build up foreign key refer to this Model
 * @property {string}          [referName]        specify different foreign key names to refer same table multiple times
 * @property {string}          [onDelete]         specify onDelete action: 'CASCADE', 'SET NULL' ...
 * @property {string}          [onUpdate]         specify onUpdate action
 * @property {array|boolean}   [VALIDATION]       isEmail: true, isInt: [{ min: 1 }] {@link https://www.npmjs.com/package/validator|validator}
 */

/**
 * define a new model
 *
 * @param {string} name             model      name(singular), and table name will be plural form of model name defaultly.
 * @param {object.<string, Column>} columns    KEY as column name, property name
 * @param {{tableName: string}}     options    you can customzie your table name by assign it to tablename in options.
 * @returns {Model}
 */
EmmoModel.prototype.define = function(name, columns, options) {
  var columnNames = [], updatableColumnNames = [], primaryKeys = [], autoIncrementColumnName = '';
  _.each(columns, function(coldef, colname) {
    columnNames.push(colname);
    if (coldef.autoIncrement)
      autoIncrementColumnName = colname;
    else
      updatableColumnNames.push(colname);
    if (coldef.primaryKey)
      primaryKeys.push(colname);
  });
  this.definition[name] = {
    columns: columns,
    options: options || {},
    columnNames: columnNames,
    updatableColumnNames: updatableColumnNames,
    primaryKeys: primaryKeys,
    autoIncrementColumnName: autoIncrementColumnName
  };
  this.models[name] = createModel(this, name, this.definition[name]);
  return this.models[name];
};

/**
 * @typedef InitOptions
 * @type {object}
 * @property {string}   modelsPath          path to model files folder
 * @property {string}   migrationsPath      path to migration files folder
 * @property {string}   dialect             'pg' is only option for now.
 * @property {string}   database            ORIGIN database name, migration will be created base on it
 * @property {string}   connectionString    need to replace database name with %s
 * @property {boolean}  autoTrim            trim spaces for string type automatically
 */

/**
 * init
 *   1. should be fired up during app startup process.
 *   2. model need to require this file, so this prcoess can't be in constructor
 *   3. share definition among multiple EmmoModel
 *
 * @param {InitOptions} options
 */
EmmoModel.prototype.init = function(options) {
  if (this.inited)
    return;
  this.inited = true;

  // if options is undefined, load em.json located in app root folder
  if (!options) {
    this.jsonPath = path.resolve('./em.json');
    this.json = require(this.jsonPath);
    options = _.clone(this.json);
    if (options.modelsPath) options.modelsPath = path.resolve(options.modelsPath);
    if (options.migrationsPath) options.migrationsPath = path.resolve(options.migrationsPath);
  }
  _.extend(this, {
    modelsPath: path.resolve('./models'),
    migrationsPath: path.resolve('./migrations'),
    dialect: 'pg',
    connectionString: '',
    autoTrim: true
  }, options);

  if (!options.connectionString)
    throw new error('connectionString can not be empty');

  if (!options.database)
    throw new error('database can not be empty');

  // make sure we are not sharing the models amount multiple em inst.
  if (!options.models) {
    // load models
    fs.readdirSync(this.modelsPath).forEach(function(filename) {
      if (!/\.js$/.test(filename))
        return;
      require(path.resolve(this.modelsPath, filename));
    }, this);

    // normalize definition(pure database structure description, for generating mirgration).
    if (!this.normalized)
      this.normalized = normalizeDef(this.definition);
  }
  

  // load dialect
  this.agent = require('./dialect/' + this.dialect + '.js');

  // copy database functions from dialect
  var self = this;
  _.extend(this, this.agent.functions, function(p, f, k) {
    return function() {
      return new Expression(f.apply(self, arguments));
    };
  });
  this.quote = this.agent.quote;
  this.quoteString = this.agent.quoteString;

  return this;
};

/**
 * lazy load sql script to create a brand new database
 *
 * @returns {string} sql script
 */
EmmoModel.prototype.getInitialScript = function() {
  if (!this.initialScript) {
    this.initialScript = Sql.initialScript(this.dialect, this.normalized);
  }
  return this.initialScript;
};

/**
 * lazy load normalized table definitions, to be saved in database for creating migration
 * 
 * @returns {string} tables definition JSON format
 */
EmmoModel.prototype.getNormalizedJson = function() {
  if (!this.normalizedJson) {
    this.normalizedJson = JSON.stringify(this.normalized);
  }
  return this.normalizedJson;
};

/**
 * lazy load migrator
 *
 * @returns {Migrator}
 */
EmmoModel.prototype.getMigrator = function() {
  if (!this.migrator) {
    this.migrator = new Migrator({
      migrationsPath: this.migrationsPath,
      normalizedJson: this.getNormalizedJson()
    });
  }
  return this.migrator;
};

/**
 * create a new EmmoModel instance to a new server with same dialect, like for backup/duplicate
 *
 * @param {InitOptions} options
 * @returns {EmmoModel}
 */
EmmoModel.prototype.spawn = function(options) {
  return new EmmoModel(_.defaults(options, _.pick(this, [
    "modelsPath", "migrationsPath", "database", "definition", "normalized", "autoTrim"
  ])));
};


/**
 * @callback EmmoModel~job
 * @param {Session} db
 * @retuns {Promise}
 */
/**
 * this is where you perform database operation
 *   1. run operation over specific database em.scope(databasename, job);
 *   2. run operation over origin database em.scope(job);
 *   3. job is a function take a session instance to perform operation
 *   4. you must return a promise in job function so scope can release connection when finish
 *   5. origin normally refer to `database` in your_project/em.json file.
 *
 * @example
 *  var em = require('emmo-model');
 *  em.scope('db1', funciton(db) {
 *    return db.all('User');
 *  }).then(function(users) {
 *    console.log(users);
 *  });
 *
 * @param {string} [databaseName=origin]    which database you want to operate
 * @param {EmmoModel~job} job       perform operation with session instance, need to return promise
 * @returns {promise} 
 */
EmmoModel.prototype.scope = function(arg1, arg2) {
  var database, job, self = this;
  if (_.isFunction(arg2)) {
    job = arg2;
    database = arg1 || this.database;
  } else {
    job = arg1;
    database = this.database;
  }
  var session = new Session(this, database);
  var promise = job(session);
  if (!promise || !_.isFunction(promise.finally)) 
    throw new Error("Must return a promise");
  
  return promise.finally(session.close.bind(session));
};


/**
 * perform database structure synchoronization.
 *   1. missed databases will be created automatically.
 *   2. existing databases will be migrated smartly.
 *   3. whenever shit happens during creating process, it will be deleted.
 *   4. migration failure should not affect existing databases.
 *
 * @param {string|array} [databases=ALL]
 */
EmmoModel.prototype.sync = function(databases) {
  this.init();
  var self = this;
  databases = databases || (this.all && this.all.length ? this.all : [ this.database ]);

  return Promise2.each(databases, function(database) {
    return self.create(database).error(function(err) {
      // if creating process has failed, it means we should do migration.
      if (err.EM_ERROR_CODE !== 'creation')
        return Promise2.reject(err);
      
      var migrator = this.getMigrator();
      return this.scope(database, function(db) {
        return migrator.run(db);
      }).then(function(){ 
        /**
         * when the database is migrated, you can perform initialize against database here.
         * @event EmmoModel#migrated
         * @param {string} databaseName
         */
        self.emit('migrated', database);  
      });
    });
  }).then(function() {
    /**
     *  when all databases are created or migrated sucessfully, you can do some system bootstrap here.
     *  @event EmmoModel#ready
     */
    self.emit('ready');
  });
};

/**
 * recreate ORIGIN database, useful for unit test scenario
 *
 * @returns {Promise}
 */
EmmoModel.prototype.dropCreate = function() {
  this.init();
  var self = this;
  return self.remove(self.database).finally(function() {
    return self.create(self.database);
  });
};

/**
 * save valid database names into em.json file
 *
 * @param {boolean} isCreate    indicate add/remove action
 * @param {string}  database    name of the database
 */
EmmoModel.prototype.saveChange = function(isCreate, database) {
  if (!this.jsonPath) return;
  var all = this.json.all || [];
  var index = all.indexOf(database);
  if (isCreate && index < 0)
    all.push(database);
  else if (index >= 0)
    _.pullAt(all, index);
  if (all.length === 0 && this.json.hasOwnProperty('all'))
    delete this.json.all;
  else
    this.json.all = all;
  fs.writeFileSync(this.jsonPath, JSON.stringify(this.json, null, 2));
};

/**
 * create a database base on definition
 *
 * @fires   EmmoModel#created
 * @param   {string}  [database=ORIGIN]
 * @returns {Promise} 
 */
EmmoModel.prototype.create = function(database) {
  this.init();
  database = database || this.database;
  var self = this;
  return this.scope(this.agent.defaultDatabase, function(db) {
    // step 1:  connect to server default database, run CREATE DATABASE statement
    return db.query(self.agent.createDatabase(database)).error(function(err) {
      err.EM_ERROR_CODE = err.EM_ERROR_CODE || 'creation'; // either connection failure or creation failure.
      return Promise2.reject(err);
    });
  }).then(function() {
    // step 2:  fetch DATABASE STRUCTURE CREATION SCRIPT, connect to new database and apply it!
    var initialScript = self.getInitialScript();
    var migrator = self.getMigrator();
    return self.scope(database, function(db) {
      return db.query(initialScript).then(function() {
        // insert new migration history record
        return db.insert('_Migration', migrator.lastMigrationData());
      });
    }).error(function(err) {
      // seems thing went south, create a debug file, as generated SQL Script along with ERROR information.
      require('fs').writeFileSync('./initial-debug.sql', initialScript + _.repeat('\n', 10) + util.inspect(err));
      // then remove useless database so that we can re-created it next time.
      return self.remove(database).finally(function() {
        return Promise2.reject(new Error('An error ocurred during initialation, may causued by wrong model definition, check initial-debug.sql in your project folder'));
      });
    });
  }).tap(function() {
    // step 3: save information to em.json, so we know how many databases we have currently
    return self.saveChange(true, database);
  }).tap(function() {
    // step 4: fire out the created event
    /**
     * when the database is created first time, you can plant seed data at this point, like insert admin user.
     * @event EmmoModel#created
     * @param {string} databaseName
     */
    self.emit('created', database);
  });
};

/**
 * remove a database from server
 *
 * @param {string} [database=ORIGIN]
 * @returns {Promise}
 */
EmmoModel.prototype.remove = function(database) {
  this.init();
  database = database || this.database;
  var self = this;
  
  // abadon spare connections in pool so we can remove target database
  self.agent.close();
  return this.scope(this.agent.defaultDatabase, function(db) {
    return db.query(self.agent.dropDatabase(database));
  }).tap(function() {
    return self.saveChange(false, database);
  });
};

/**
 * export a ready to use instance, you can spawn a new Instance
 */
module.exports = new EmmoModel();

/**
 * create new EmmoModel instance
 *
 * @example
 *
 * var server2 = require('emmo-model').new();
 * server2.init(...);
 */
module.exports.new = EmmoModel;


/**
 * easy way to create RESTful api.
 *
 * @example
 * var em = require('emmo-model');
 *
 * app.get('/api/users', em.mount(function(req, res) {
 *   return em.scope('db2', db => db.all('User'));
 * }));
 *
 * var User = require('../models/user.js');
 * app.get('/api/users/:id', em.mount(function(req, res) {
 *   return User.find(req.params.id);
 * }));
 */
module.exports.mount = function(handler) {
  return function(req, res, next) {
    var promise = handler(req, res, next);
    if (!_.isFunction(promise.then))
      throw new Error('Expect returning a promise instance');

    promise.then(function(result) {
      return res.json(result);
    }).catch(function(err) {
      res.status(400);
      if (err.description) // valid description property indicates this is handled rejection
        return res.json(err);
      throw err;
    });
  };
};
