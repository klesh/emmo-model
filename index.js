var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var normalizeDef = require('./lib/norm-definition.js');
var Session = require('./lib/session.js');
var Migrator = require('./lib/migrator.js');
var Sql = require('./lib/sql-generator.js');
var createModel = require('./lib/create-model.js');

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
    options = require(path.resolve('./em.json'));
    if (options.modelsPath) options.modelsPath = path.resolve(options.modelsPath);
    if (options.migrationsPath) options.migrationsPath = path.resolve(options.migrationsPath);
  }
  _.extend(this, {
    modelsPath: path.resolve('./models'),
    migrationsPath: path.resolve('./migrations'),
    dialect: 'pg',
    connectionString: '',
    database: ''
  }, options);

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
};

EmmoModel.prototype.define = function(name, columns, options) {
  var columnNames = [], updatableColumnNames = [], autoIncrementColumnName = '';
  _.each(columns, function(colDef, colName) {
    columnNames.push(colName);
    if (colDef.autoIncrement)
      autoIncrementColumnName = colName;
    else
      updatableColumnNames.push(colName);
  });
  this.definition[name] = {
    columns: columns,
    options: options || {},
    columnNames: columnNames,
    updatableColumnNames: updatableColumnNames,
    autoIncrementColumnName: autoIncrementColumnName
  };
  this.models[name] = createModel(this.definition[name]);
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
    "modelsPath", "migrationsPath", "database", "definition", "normalized"
  ])));
};

EmmoModel.prototype.scope = function(arg1, arg2) {
  var database, job, self = this;
  if (_.isFunction(arg2)) {
    job = arg2;
    database = arg1;
  } else {
    job = arg1;
    database = this.database;
  }
  var session = new Session(this, database);
  return job(session).tap(session.close.bind(session));
};

EmmoModel.prototype.createOrMigrate = function() {
  var self = this;
  return self.create(this.database)
    .then(function(){
      return self.initial(self.database).return(true);
    })
    .error(function() {
      return self.migrate(self.database).return(false);
    });
};

EmmoModel.prototype.create = function(database) {
  database = database || this.database;
  var self = this;
  return this.scope(this.agent.defaultDatabase, function(db) {
    return db.query(self.agent.createDatabase(database));
  });
};

EmmoModel.prototype.remove = function(database) {
  database = database || this.database;
  var self = this;
  return this.scope(this.agent.defaultDatabase, function(db) {
    return db.query(self.agent.dropDatabase(database));
  });
};

EmmoModel.prototype.initial = function(database) {
  var initialScript = this.getInitialScript();
  var migrator = this.getMigrator();
  return this.scope(database, function(db) {
    return db.query(initialScript)
      .then(function() {
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
