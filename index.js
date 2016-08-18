"use strict";
/* jshint node: true */

var i = require('i')();
var fs = require('fs');
var path = require('path');
var util = require('util');
var _ = require('lodash');
var P = require('bluebird');
var V = require('validator');
var EventEmitter = require('events');
var debug = require('debug')('emmo-model:index');

var Session = require('./lib/session.js');
var Expression = require('./lib/expression.js');
var Migrator = require('./lib/migrator.js');
var Store = require('./lib/store.js');

var buildModel = require('./lib/model.js');
var allValidators = _.keys(V).filter(fn => _.startsWith(fn, 'is') || [ 'contains', 'matches', 'equals' ].indexOf(fn) >= 0);

P.longStackTraces();


/**
 * A object to contain Entity definition
 *
 * @typedef Entity
 * @type {object}
 * @property {string}           tableName
 * @property {Property[]}       properties
 * @property {string[]}         propertyNames
 * @property {string[]}         updatableNames
 * @property {string[]}         inputableNames
 * @property {string[]}         primaryKeyNames
 * @property {string}           autoIncrementName
 */

/**
 * A object to contain Property definition
 * Note allowNull property will cause a empty string validation for string property.
 *
 * @example
 *
 * {
 *   id: { type: 'bigint', autoIncrement: true, primaryKey: true },
 *   account: { type: 'string', length: 50, allowNull: false }, // allowNull will reject '' for string type as well
 *   password: { type: 'string', virtual: true, isLength: { min: 5, 20 } },  // virtual property will not be mapped to db
 *   repassword: { type: 'string', virtual: true, validators: [ // this is how you define customize validators
 *     function(value) {
 *       return this.password === value;
 *     }
 *   ]},
 *   passwordHash: { type: 'string', length: 50, input: false }, // will be ignored in User.input convertion
 *   age: { type: 'int', isInt: { min: 18, max: 120 } },
 *   email: { type: 'string', isEmail: true },
 * }
 *
 *
 * @typedef Property
 * @type {Column}
 * @property {string}           columnName
 * @property {boolean}          [virtual=false]           only in memory, do not map to database
 * @property {boolean}          [input=true]              accept input from user 
 * @property {string}           [dateFormat=ISO8601]      how to parse Date @see {@link http://momentjs.com/docs/#/parsing/}
 * @property {boolean|boolean}  [autoTrim=true]           trim space characters for string type, pass 'length' to trancate by length property
 * @property {string|boolean}   [index]                   assign same index name to multiple columns will create a composite index
 * @property {boolean}          [unique]                  create a unique index or set existing index to unique
 * @property {boolean}          [desc=true]               create a descending index
 * @property {string}           [refer]                   build up foreign key reference
 * @property {string}           [referName]               specify different referNames to refer same table multiple times
 * @property {string}           [onDelete]                specify onDelete action: 'CASCADE', 'SET NULL' ...
 * @property {string}           [onUpdate]                specify onUpdate action
 * @property {string}           [message]                 error message when validation failure
 * @property {array|boolean}    [VALIDATION]              isEmail: true, isInt: { min: 1 }
 *                                                        {@link https://www.npmjs.com/package/validator|validator}
 * @property {Validator[]}      [validators]
 */

/**
 * EmmoModel holds all entities definitions, and a Database Server for you.
 * <p>EmmoModel is a EventEmitter, you can subscribe events by once/on</p>
 * @constructor
 * @param {EmmoModel} [parent]
 */
function EmmoModel(parent) {
  // initialize definition, add _Migration model to store model definition.
  EventEmitter.call(this);

  this.parent = parent;

  /**
   * store all extra information than Model for runtime
   *
   * @type {object.<string, Entity>}
   */
  this.entities = parent ? parent.entities : {};

  /**
   * store all Models you ever defined.
   * 
   * @type {object.<string, Model>}
   */
  this.models = {};

  // clone all models to bind this instance.
  if (parent) {
    _.each(parent.entities, function(entity, name) {
      this.models = buildModel(this, name, entity);
    }, this);
  }


  this.define('_Migration', {
    uid: { type: 'bigint', primaryKey: true, allowNull: false },
    name: { type: "string", length: 50, unique: true }, 
    models: { type: "string" }
  });
}

util.inherits(EmmoModel, EventEmitter);

/**
 * define a new Model
 *
 * @param {string}                      name                singular
 * @param {object.<string, Property>}   properties          KEY as property name
 * @param {string|object}               [tableOptions|tableName=names]   plural
 * @returns {Model}
 */
EmmoModel.prototype.define = function(name, properties, tableOptions) {
  // build up entity
  if (_.isString(tableOptions)) {
    tableOptions = {
      tableName: tableOptions
    };
  } else if (!tableOptions) {
    tableOptions = {};
  }

  var tableName = tableOptions.tableName || i.pluralize(name);
  delete tableOptions.tableName;

  var entity = {
    tableName: tableName,
    properties: properties,
    propertyNames: [],
    updatableNames: [],
    inputableNames: [],
    primaryKeyNames: [],
    requiredNames: [],
    autoIncrementName: '',
    tableOptions: tableOptions
  };

  _.each(properties, function(property, name) {
    property.$name = name;

    // create validator for property
    if (!_.isArray(property.validators))
      property.validators = [];

    if (property.autoIncrement) {
      property.validators.push(function autoIncrement(value) {
        return V.isInt(value) && value > 0;
      });
    } else {
      if (property.length > 0) {
        property.validators.push(function length(value) {
          return (value.toString()).length <= property.length;
        });
      }
      
      _.each(_.intersection(allValidators, _.keys(property)), function(validatorName) {
        var parameter = property[validatorName];
        var validator;
        if (parameter === true) {
          validator = function(value) {
            return V[validatorName](value);
          };
        } else {
          validator = function(value) {
            return V[validatorName](value, parameter);
          };
        }
        validator.reason = validatorName;
        property.validators.push(validator);
      });
    }

    // columnName equals to property name defaulty
    if (property.virtual !== true) {
      property.columnName = property.columnName || name;
      entity.propertyNames.push(name);
    }

    // find out autoIncrement and updatable properties
    if (property.autoIncrement) 
      entity.autoIncrementName = name;
    else if (property.virtual !== true)
      entity.updatableNames.push(name);

    // collect inputable properties
    if (property.input !== false) {
      entity.inputableNames.push(name);
      
      if (!property.autoIncrement && property.allowNull === false && property.defaultValue === null && property.defaultValue === undefined) {
        entity.requiredNames.push(name);
      }
    }

    // collect primary key properties
    if (property.primaryKey === true)
      entity.primaryKeyNames.push(name);

  });
  
  if (entity.primaryKeyNames.length === 0)
    throw new Error(name + ' has not primary key');

  // save up
  this.entities[name] = entity;
  // build up model
  var Model = buildModel(this, name, entity);
  this.models[name] = Model;
  return Model;
};

/**
 * @typedef InitOptions
 * @type {object}
 * @property {string}   [modelsPath='./models']           path to model files folder
 * @property {string}   [migrationsPath='./migrations']   path to migration files folder
 * @property {string}   [dialect=pg]                      'pg' is only option for now.
 * @property {string}   database                          ORIGIN database name, migration will be created base on it
 * @property {string}   connectionString                  need to replace database name with %s
 */

/**
 * init
 *   1. should be fired up during app startup process.
 *   2. model need to require this file, so this prcoess can't be in constructor
 *   3. share definition among multiple EmmoModel
 *
 * @param {InitOptions|string} [optionsOrConfigPath]
 * @param {object}  store       should provide add/remove/exists/getAll as ./lib/store.js did
 */
EmmoModel.prototype.init = function(options, store) {
  if (this.inited)
    return this;
  this.inited = true;

  if (!options) {
    this.configPath = path.resolve('./em.json');
    this.config = require(this.configPath);
  } else if (_.isString(options)) {
    this.configPath = options;
    this.config = require(path.resolve(this.configPath));
  } else {
    this.config = options;

    var absPath = path.resolve('./em.json');
    if (fs.existsSync(absPath)) {
      this.config = _.defaults(options, require(absPath));
    }
  }


  _.defaults(this.config, {
    modelsPath: './models',
    migrationsPath:'./migrations',
    dialect: 'pg',
    connectionString: ''
  });


  if (!this.config.connectionString)
    throw new Error('init failure: connectionString can not be empty');

  if (!this.config.database)
    throw new Error('init failure: database can not be empty');

  if (!this.config.modelsPath)
    throw new Error('init failure: modelsPath can not be empty');

  if (!this.config.migrationsPath)
    throw new Error('init failure: migrationsPath can not be empty');

  this.store = store || new Store(this);
  this.modelsPath = path.resolve(this.config.modelsPath);
  this.migrationsPath = path.resolve(this.config.migrationsPath);

  // make sure we are not sharing the models among multiple em inst.
  if (!this.parent && fs.existsSync(this.config.modelsPath)) {
    // load models
    _.each(fs.readdirSync(this.config.modelsPath), function(fileName) {
      if (/\.js$/.test(fileName)) {
        require(path.resolve(this.config.modelsPath, fileName));
      }
    }, this);
  }
  
  // load dialect
  this.agent = require('./dialect/' + this.config.dialect + '.js');

  // copy database functions from dialect
  _.each(this.agent.functions, function(f, n) {
    this[n] = function() {
      return new Expression(f.apply(this.agent.functions, arguments), this, 'function');
    };
  }, this);

  // copy database comparators from dialect
  _.each(this.agent.comparators, function(f, n) {
    this[n] = function() {
      return new Expression(f.apply(this.agent.comparators, arguments), this, 'comparator');
    };
  }, this);

  return this;
};

EmmoModel.prototype.getAllDatabases = function() {
  var self = this;
  self.init();
  return self.store.getChildren().then(function(children) {
    return children.concat(self.config.database);
  });
}

/**
 * create a new EmmoModel instance to a new server with same definition, like for backup/duplicate
 *
 * @param {InitOptions} options
 * @returns {EmmoModel}
 */
EmmoModel.prototype.spawn = function(options) {
  return new EmmoModel(this).init(options);
};

/**
 * @callback EmmoModel~job
 * @param {Session} db
 * @retuns {Promise}
 */
/**
 * this is where you perform database operations
 *   1. run operation over specific database em.scope(databasename, job);
 *   2. run operation over ORIGIN database em.scope(job);
 *   3. job is a function take a session instance to perform operation
 *   4. you must return a promise in job function so scope can release connection when finish
 *   5. ORIGIN normally refer to `database` in your_project/em.json file.
 *   6. you can perform TRANSCACTION in a scope.
 *
 * @example
 *  var em = require('emmo-model');
 *  em.scope('db1', funciton(db) {
 *    return db.all('User');
 *  }).then(function(users) {
 *    console.log(users);
 *  });
 *
 * @param {string}          [database=ORIGIN]   which database you want to operate
 * @param {EmmoModel~job}   job                 perform operation with session instance, need to return promise
 * @returns {promise} 
 */
EmmoModel.prototype.scope = function(arg1, arg2) {
  if (!this.inited)
    throw new Error('you need to call init() before running any operation');

  if (arg1 instanceof Session)
    return arg2(arg1);

  var database, job, self = this;
  if (_.isFunction(arg2)) {
    job = arg2;
    database = arg1;
  } else {
    job = arg1;
  }
  database = database || this.config.database;
  var session = new Session(this, database);
  var promise = job(session);
  if (!promise || !_.isFunction(promise.finally)) 
    throw new Error("Must return a promise");
  
  return promise.finally(function() {
    return session.close();
  });
};

/**
 * Transaction support
 */
EmmoModel.prototype.transact = function(arg1, arg2) {
  var database = _.isString(arg1) ? arg1 : null;
  var job = _.isFunction(arg2) ? arg2 : arg1;

  return this.scope(database, function(db) {
    return db.begin().then(function() {
      return job(db);
    }).tap(function() {
      return db.commit();
    }).catch(function(err) {
      debug('TRANSACTION FAIL: ', err);
      return db.rollback().then(() => P.reject(err));
    });
  });
};

/**
 * Perform operation for all databases
 */
EmmoModel.prototype.all = function(job) {
  var self = this;
  return this.getAllDatabases().each(function(database) {
    return self.scope(database, job);
  });
};

/**
 * lazy load migrator
 *
 * @returns {Migrator}
 */
EmmoModel.prototype.getMigrator = function() {
  if (!this.migrator) {
    this.migrator = new Migrator(this);
  }
  return this.migrator;
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
  var self = this, agent = this.agent;
  const debug = './initial-debug.sql';

  if (fs.existsSync(debug))
    fs.unlinkSync(debug);

  return self.scope(agent.defaultDatabase, function(db) {
    // step 1:  connect to server default database, run CREATE DATABASE statement
    return db.query(self.agent.createDatabase(database)).error(function(err) {
      //console.log('ERROR', err);
      //console.log(err.stack);
      err.code = err.code || 'E_CREATE_DB_FAIL'; // either connection failure or creation failure.
      return P.reject(err);
    });
  }).then(function() {
    // step 2:  fetch DATABASE STRUCTURE CREATION SCRIPT, connect to new database and apply it!
    var migrator = self.getMigrator();
    return self.scope(database, function(db) {
      return db.query(migrator.getInitialSQL()).then(function() {
        // insert new migration history record
        return db.insert('_Migration', migrator.lastMigrationData());
      });
    }).error(function(err) {
      // seems thing went south, create a debug file, as generated SQL Script along with ERROR information.
      fs.writeFileSync(debug, migrator.getInitialSQL() + _.repeat('\n', 10) + util.inspect(err));
      // then remove useless database so that we can re-created it next time.
      return self.remove(database).finally(function() {
        return P.reject(new Error('An error ocurred during initialation, may causued by wrong model definition, check initial-debug.sql in your project folder'));
      });
    });
  }).tap(function() {
    // step 3: fire out event, and save information to em.json, so we know how many databases we have currently
    /**
     * when the database is created first time, you can plant seed data at this point, like insert admin user.
     * @event EmmoModel#created
     * @param {string} database
     */
    self.emit('created', database);
    if (database !== self.config.database)
      return self.store.add(database);
  });
};

/**
 * remove a database from server
 *
 * @fires EmmoModel#removed
 * @param {string} [database=ORIGIN]
 * @returns {Promise}
 */
EmmoModel.prototype.remove = function(database) {
  this.init();
  var self = this, agent = this.agent;
  
  // abadon spare connections in pool so we can remove target database
  return self.agent.dispose().then(function() {
    return self.scope(agent.defaultDatabase, function(db) {
      return db.query(self.agent.dropDatabase(database));
    }).tap(function() {
      /**
       * when database is removed
       * @event EmmoModel#removed
       * @param {string} database
       */
      self.emit('removed', database);
      return self.store.remove(database);
    });
  });
};

/**
 * perform database structure synchoronization.
 *   1. missed databases will be created automatically.
 *   2. existing databases will be migrated smartly.
 *   3. whenever shit happens during creating process, it will be deleted.
 *   4. migration failure should not affect existing databases.
 *
 * @fires EmmoModel#created
 * @fires EmmoModel#migrated
 * @fires EmmoModel#ready
 * @param {string|array} [databases=ALL]
 */
EmmoModel.prototype.sync = function(databases) {
  this.init();
  var self = this, p;

  if (databases) {
    if (_.isString(databases))
      databases = [ databases ];

    if (databases.length)
      p = P.resolve(databases);
  }
  
  p = p || this.getAllDatabases();

  return p.each(function(database) {
    return self.create(database).error(function(err) {
      // if creating process has failed, it means we should do migration.
      if (err.code !== 'E_CREATE_DB_FAIL')
        return P.reject(err);
      
      var migrator = self.getMigrator();
      return self.scope(database, function(db) {
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
  return self.remove(self.config.database).finally(function() {
    return self.create(self.config.database);
  });
};

/**
 * export a ready to use instance, you can spawn a new Instance
 */
var em = module.exports = new EmmoModel();

/**
 * create new EmmoModel instance
 *
 * @example
 *
 * var server2 = require('emmo-model').new();
 * server2.init(...);
 */
em.new = function() {
  return new EmmoModel();
};

var DEV = process.env.NODE_ENV !== 'production';
/**
 * easy way to create RESTful api.
 *
 * @example
 * var em = require('emmo-model');
 * var User = require('../models/user.js');
 *
 * app.get('/api/users/:id', em.mount(req => User.find(req.params.id)));
 */
em.mount = function(handler) {
  return function(req, res, next) {
    var promise = handler(req, res, next);
    if (!_.isFunction(promise.then))
      next(new Error('Expect returning a promise instance'));

    promise.then(function(result) {
      if (!_.isObject(result)) {
        result = { code: 'SUCCESS', result: result };
      }
      res.json(result || { code: 'SUCCESS' });
    }).catch(next);
  };
};


/**
 * @typedef ModelErrorInfo
 * @type {object}
 * @property {string}   entityName
 * @property {Entity}   entity
 * @property {string}   propertyName
 * @property {Property} property
 * @property {string}   reason
 */
/**
 * Create a error for Model convertion/validation, replace this to customize your error instance
 *
 * @callback Model~newErr
 * @param {string}          code        error code
 * @param {ModelErrorInfo}  [info]      validator name/relevant definition/customize validator function name
 */
em.newModelErr = function(code, info) {
  var message;
  switch (code) {
    case 'E_DATA_EMPTY':
      message = 'Input data can not be a empty object';
      break;
    case 'E_TYPE_ERROR':
      message = 'Illegal input value for ' + info.entityName + '.' + info.propertyName;
      break;
    case 'E_VALIDATION_FAIL':
      message = info.property.message || 'Validation fail for ' + info.entityName + '.' + info.propertyName + ' ' + info.reason;
      break;
  }
  var error = new Error(message);
  error.code = code;
  error.description = message;
  return error;
};
