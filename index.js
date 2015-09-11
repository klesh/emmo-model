var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var normalizeDef = require('./lib/norm-definition.js');

function EmmoModel() {
  // initialize definition, add _Migration model to store model definition.
  this.definition = {
    __Migration: { // store migration history
      columns: {
        uid: { type: 'bigint', primaryKey: true, allowNull: false },
        name: { type: "string", length: 50, unique: true }, 
        definition: { type: "string" }
      }
    }
  };
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

  // load dialect
  this.agent = require('./dialect/' + this.dialect + '.js');
};

EmmoModel.prototype.define = function(name, columns, options) {
  this.definition[name] = {
    columns: columns,
    options: options
  };
};

EmmoModel.prototype.getInitialScript = function() {
  if (!this.initialScript) {
    this.initialScript = this.agent.initialScript(normalizeDef(this.definition));
  }
  return this.initialScript;
};

EmmoModel.prototype.connect = function(database) {
  if (!this.connectionString)
    throw new Error('ConnectionString is empty');
  return this.agent.connect(this.connectionString, database).spread(function(connection, release) {
    return new Database(this, connection, release);
  });
};

EmmoModel.prototype.scope = function(databaseName, job) {
  if (_.isFunction(databaseName)) {
    job = databaseName;
    databaseName = this.agent.defaultDatabase
  }
  return this.connect(databaseName).then(function(database) {
    return job(database).finally(database.release);
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
  return this.exec(function(db) {
    return db.createDatabase(database);
  });
};

EmmoModel.prototype.remove = function(database) {
  return this.exec('', function(db) {
    return db.removeDatabase(database);
  });
};

EmmoModel.prototype.initial = function(database) {
  var initialScript = this.getInitialScript();
  var migrator = this.getMigrator();
  return this.exec(database, function(db) {
    return db.query(initialScript)
      .then(function() {
        db.insert('_Migration', migrator.lastMigrationData());
      });
  });
};

EmmoModel.prototype.migrate = function(database) {
  var migrator = this.getMigrator();
  return this.exec(database, function(db) {
    return db.selectOne('_Migration', {field: 'uid', order: {uid: 'DESC'}, limit: 1})
      .then(function(dbLastMigration) {
        return migrator.run(dbLastMigration);
      });
  });
};

EmmoModel.prototype.getMigrator = function() {
  if (!this.migrator) {
    this.migrator = new Migrator(this.migrationsPath);
  }
  return this.migrator;
};

EmmoModel.prototype.exec = function(promiseWork) {
  this.connect().spread(function(connection, release) {
    promiseWork(new ConnectionScope(connection)).finally(release);
  });
};

module.exports = new EmmoModel();
module.exports.new = function(options) {
  return new EmmoModel(options);
};
