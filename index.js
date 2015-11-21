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

function EmmoModel() {
  // initialize definition, add _Migration model to store model definition.
  this.models = {};
  this.definition = {};
  this.define('_Migration', {
    uid: { type: 'bigint', primaryKey: true, allowNull: false },
    name: { type: "string", length: 50, unique: true }, 
    models: { type: "string" }
  });
}

EmmoModel.prototype.init = function(options) {
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

  if (!options.database)
    throw new Error('database can not be empty');

  // load models
  fs.readdirSync(this.modelsPath).forEach(function(fileName) {
    if (!/\.js$/.test(fileName))
      return;
    require(path.resolve(this.modelsPath, fileName));
  }, this);
  
  // normalize definition(pure database structure description, for generating mirgration).
  this.normalized = normalizeDef(this.definition);

  // load dialect
  this.agent = require('./dialect/' + this.dialect + '.js');

  // initialize dialectized Session which contains database function support
  if (!this.agent._Session) {
    var _Session = function() {
      Session.apply(this, arguments);
    };

    util.inherits(_Session, Session);

    var self = this;
    _.extend(_Session.prototype, this.agent.functions, function(p, f, k) {
      var x = function() {
        return new Expression(f.apply(_Session.prototype, arguments));
      };
      self[k] = x; 
      return x;
    });
    
    _Session.prototype.quote = this.agent.quote;
    _Session.prototype.quoteString = this.agent.quoteString;

    this.agent._Session = _Session;
  }
  this.Session = this.agent._Session;

  if (this.onReady) _.each(this.onReady, function(onReady) { onReady(); });
};

// callback will be trigger when database is created or migrated
EmmoModel.prototype.ready = function(callback) {
  this.onReady = this.onReady || [];
  this.onReady.push(callback);
};

// callback will be trigger when database is craeted
EmmoModel.prototype.initialize = function(callback) {
  this.onInitial = this.onInitial || [];
  this.onInitial.push(callback);
};

EmmoModel.prototype.define = function(name, columns, options) {
  var columnNames = [], updatableColumnNames = [], primaryKeys = [], autoIncrementColumnName = '';
  _.each(columns, function(colDef, colName) {
    columnNames.push(colName);
    if (colDef.autoIncrement)
      autoIncrementColumnName = colName;
    else
      updatableColumnNames.push(colName);
    if (colDef.primaryKey)
      primaryKeys.push(colName);
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

EmmoModel.prototype.getInitialScript = function() {
  if (!this.initialScript) {
    this.initialScript = Sql.initialScript(this.dialect, this.normalized);
  }
  return this.initialScript;
};

EmmoModel.prototype.getNormalizedJson = function() {
  if (!this.normalizedJson) {
    this.normalizedJson = JSON.stringify(this.normalized);
  }
  return this.normalizedJson;
};

EmmoModel.prototype.spawn = function(options) {
  return new EmmoModel(_.defaults(options, _.pick(this, [
    "modelsPath", "migrationsPath", "database", "definition", "normalized", "autoTrim"
  ])));
};

EmmoModel.prototype.scope = function(arg1, arg2) {
  var database, job, self = this;
  if (_.isFunction(arg2)) {
    job = arg2;
    database = arg1 || this.database;
  } else {
    job = arg1;
    database = this.database;
  }
  var session = new this.Session(this, database);
  return job(session).finally(session.close.bind(session));
};

EmmoModel.prototype.sync = function(p) {
  if (!this.agent) this.init();
  var self = this;
  var databases = this.all || [ this.database ];
  var cb = _.noop;

  if (_.isString(p))
    databases = [ p ];
  else if (_.isArray(p))
    databases = p;
  else if (_.isFunction(p))
    cb = p;

  return Promise2.each(databases, function(database) {
    return self.create(database).tap(function() {
      if (!self.onInitial) 
        return ;

      return Promise2.all(self.onInitial.map(function(oi) {
        return oi.call(self);
      }));
    }).tap(function(){
      return cb(true, database);
    }).error(function() {
      self.saveChange(true, database);
      return self.migrate(database).then(function() {
        return cb(false, database);
      });
    });
  });
};

EmmoModel.prototype.dropCreate = function() {
  if (!this.agent) this.init();
  var self = this;
  return self.remove(self.database).finally(function() {
    return self.create(self.database);
  });
};

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

EmmoModel.prototype.create = function(database) {
  if (!this.agent) this.init();
  database = database || this.database;
  var self = this;
  return this.scope(this.agent.defaultDatabase, function(db) {
    return db.query(self.agent.createDatabase(database));
  }).then(function() {
    return self.initial(database);
  }).tap(function() {
    return self.saveChange(true, database);
  }).thenReturn(true);
};

EmmoModel.prototype.remove = function(database) {
  if (!this.agent) this.init();
  database = database || this.database;
  var self = this;
  return this.scope(this.agent.defaultDatabase, function(db) {
    return db.query(self.agent.dropDatabase(database));
  }).tap(function() {
    return self.saveChange(false, database);
  });
};

EmmoModel.prototype.initial = function(database) {
  if (!this.agent) this.init();
  var initialScript = this.getInitialScript();
  var migrator = this.getMigrator();
  return this.scope(database, function(db) {
    return db.query(initialScript).then(function() {
      return db.insert('_Migration', migrator.lastMigrationData());
    });
  });
};

EmmoModel.prototype.migrate = function(database) {
  var migrator = this.getMigrator();
  return this.scope(database, function(db) {
    return migrator.run(db);
  });
};

EmmoModel.prototype.getMigrator = function() {
  if (!this.migrator) {
    this.migrator = new Migrator({
      migrationsPath: this.migrationsPath,
      normalizedJson: this.getNormalizedJson()
    });
  }
  return this.migrator;
};

module.exports = new EmmoModel();
module.exports.new = function(options) {
  return new EmmoModel(options);
};
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
