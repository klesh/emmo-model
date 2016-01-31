var _ = require('lodash');
var moment = require('moment');
var fs = require('fs');
var path = require('path');
var P = require('bluebird');
var Sql = require('./sql.js');
var purify = require('./purify.js');

/**
 * Create/Migrate database sturcture
 *
 * @param {EmmoModel}  em
 * @constructor
 */
function Migrator(em) {
  this.em = em;
  this.migrationsPath = em.migrationsPath;
  this.dialect = em.config.dialect;
  this.purified = purify(em.entities);

  if (!fs.exists(this.migrationsPath)) {
    this.migrations = [];
    return;
  }

  var pattern = /((\d{14})-.*?)\.sql$/, migrationsPath = this.migrationsPath;

  var migrations = fs.readdirSync(this.migrationsPath).filter(function(f) { 
    return self.pattern.test(f); 
  }).map(function(f) { 
    var m = pattern.exec(f);
    return {
      uid: m[2],
      name: m[1],
      fileName: f,
      script: fs.readFileSync(path.resolve(migrationsPath, f)).toString()
    };
  });

  this.migrations = _.sortBy(migrations, 'uid');
}

/**
 * Lazy load sql script to create a brand new database
 *
 * @returns {string} SQL
 */
Migrator.prototype.getInitialSQL = function() {
  if (!this.initialScript)
    this.initialScript = Sql.initialScript(this.dialect, this.purified);
  return this.initialScript;
};

/**
 * Return purified definition as JSON string 
 *
 * @returns {string}  JSON
 */
Migrator.prototype.getModelsJSON = function() {
  if (!this.purifiedJSON)
    this.purifiedJSON = JSON.stringify(this.purified);
  return this.purifiedJSON;
};

/**
 * Return a Migration row, which can be inserted into database, so we can track down migration history.
 */
Migrator.prototype.lastMigrationData = function() {
  var data;
  if (this.migrations && this.migrations.length) {
    data = _.pick(_.last(this.migrations), ['uid', 'name']); // accept only newer than last migration
  } else {
    data = { uid: 0, name: '00000000000000-InitialCreate' }; // accept any new migration in the future
  }

  data.models = this.getModelsJSON();
  return data;
};

/**
 * Run migration
 *
 * @returns {Promise}
 */
Migrator.prototype.run = function(db) {
  var self = this;
  
  return db.one('_Migration', {
    field: 'uid', 
    order: {
      uid: 'DESC'
    }, 
    limit: 1
  }).then(function(dbLastMigration) {
    var pendingMigrations = dbLastMigration ? self.migrations.filter(function(migration) { 
      return migration.uid > dbLastMigration.uid;
    }) : self.migrations;
    
    return P.each(pendingMigrations, function(migration) {
      return db.query(migration.script);
    });
  });
};

module.exports = Migrator;
