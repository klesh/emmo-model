var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var normalizeDef = require('./lib/norm-definition.js');

function EmmoModel() {
  // initialize definition, add _Migration model to store model definition.
  this.definition = {};
  this.define('_Migration', {
    uid: { type: 'bigint', primaryKey: true, allowNull: false },
    name: { type: "string", length: 50, unique: true }, 
    models: { type: "string" }
  });
}

EmmoModel.prototype.init = function(options) {
  _.extend(this, {
    modelsPath: path.resolve('./models'),
    migrationsPath: path.resolve('./migrations'),
    dialect: 'pg',
    connectionString: '',
    database: ''
  }, options);

  // load models
  fs.readdirSync(this.modelsPath).forEach(function(fileName) {
    require(path.resolve(this.modelsPath, fileName));
  }, this);
  
  // normalize definition(pure database structure description, for generating mirgration).
  this.normalized = normalizeDef(this.definition);

  // load dialect
  this.agent = require('./dialect/' + this.dialect + '.js');
};

EmmoModel.prototype.define = function(name, columns, options) {
  this.definition[name] = {
    columns: columns,
    options: options,
    columnNames: _.keys(columns)
  };
};

EmmoModel.prototype.getInitialScript = function() {
  if (!this.initialScript) {
    this.initialScript = this.agent.initialScript(this.normalized);
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

/* if you need to connect different database base on request uri/host
 *    app.use(function(req, res, next) {
 *      var databaseName = req.query.site;
 *      em.getDatabaseName = function() {
 *        return databaseName;
 *      }
 *      next();
 *    });
 */
EmmoModel.prototype.getDatabaseName = function() {
  return this.database;
};

EmmoModel.prototype.connect = function(database) {
  database = database === true ? this.agent.defaultDatabase : (database || this.getDatabaseName());
  return this.agent.connect(util.format(this.connectionString, database))
    .spread(function(connection, release) {
      return new Database(this, connection, release);
    });
};

EmmoModel.prototype.scope = function(job, database) {
  return this.connect(database).then(function(db) {
    return job(db).tap(db.release);
  });
};

EmmoModel.prototype.createOrMigrate = function() {
  var self = this;
  return self.create(this.database)
    .then(function(){
      return self.initial(self.database);
    })
    .error(function() {
      return self.migrate(self.database);
    });
};

EmmoModel.prototype.create = function(database) {
  database = database || this.database;
  var self = this;
  return this.scope(function(db) {
    return db.query(self.agent.createDatabase(database));
  }, true);
};

EmmoModel.prototype.remove = function(database) {
  database = database || this.database;
  var self = this;
  return this.scope(function(db) {
    return db.query(self.agent.dropDatabase(database));
  }, true);
};

EmmoModel.prototype.initial = function(database) {
  var initialScript = this.getInitialScript();
  var migrator = this.getMigrator();
  return this.scope(function(db) {
    return db.query(initialScript)
      .then(function() {
        return db.insert('_Migration', migrator.lastMigrationData());
      });
  }, database);
};

EmmoModel.prototype.migrate = function(database) {
  var migrator = this.getMigrator();
  return this.scope(function(db) {
    return migrator.run(db);
  }, database);
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
