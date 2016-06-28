var _ = require('lodash');
var moment = require('moment');
var fs = require('fs');
var path = require('path');
var P = require('bluebird');
var Sql = require('./sql.js');
var purify = require('./purify.js');
var util = require('util');

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

  if (!fs.existsSync(this.migrationsPath)) {
    this.migrations = [];
    return;
  }
  

  var pattern = /((\d{14})-.*?)\.sql$/, migrationsPath = this.migrationsPath;

  var migrations = fs.readdirSync(this.migrationsPath).filter(function(f) { 
    return pattern.test(f); 
  }).map(function(f) { 
    var m = pattern.exec(f);
    var d = {
      uid: m[2],
      name: m[1],
      fileName: f,
      script: _.trim(fs.readFileSync(path.resolve(migrationsPath, f)).toString())
    };

    var js = path.resolve(migrationsPath, path.basename(f, '.sql') + '.js');
    if (fs.existsSync(js)) { // come with a customize .js file to execute the migration
      var part1 = m.script.split('/***** PLACE YOUR CUSTOMIZE SCRIPT HERE *****/');
      if (part1.length === 2) {
        d.scriptBefore = _.trim( part1[0] );
        var part2 = part1[1].split('/******** END YOUR CUSTOMIZE SCRIPT *********/');
        if (part2.length === 2) {
          d.scriptCustomize = _.trim( part2[0] );
          d.scriptAfter = _.trim( part2[1] );
        }
      }
      
      d.exec = require(js);
    } else { // omitted, need to provide a default execute method
      d.exec = function(db, migration) {
        return db.query(migration.script);
      }
    }
    return d;
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
 * Return sql script for creating _Migrations table
 *
 * @returns {string} SQL
 */
Migrator.prototype.getCreateMigrationSQL = function() {
  if (!this.createMigrationScript)
    this.createMigrationScript = Sql.initialScript(this.dialect, _.pick(this.purified, '_Migration'));
  return this.createMigrationScript;
};

/**
 * Return sql script for inserting _Migrations row of current model definitions
 *
 * @returns {string} SQL
 */
Migrator.prototype.getInsertMigrationSQL = function(uid, fullName) {
  if (!this.insertMigrationScript) {
    this.insertMigrationScript = util.format(
      'INSERT INTO %s (%s) VALUES (%s)' + this.em.agent.separator,
      this.em.agent.quote('_Migrations'),
      ['uid', 'name', 'models'].map(this.em.agent.quote).join(', '),
      [uid, fullName, this.getModelsJSON().replace(/'/g, "''")].map(function(c){
        return util.format("'%s'", c);
      })
    );
  }
  return this.insertMigrationScript;
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
    var ts = moment().format('YYYYMMDDHHmmss');
    data = { uid: ts * 1, name: ts + '-InitialCreate' }; // accept any new migration in the future
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
      return migration.exec(db, migration).catch(function(err) {
        err.MIGRATION_EXISTS = true;
        return P.reject(err);
      });
    });
  }).catch(function(err) {
    if (err.MIGRATION_EXISTS)
      return P.reject(err);

    //console.log(err.message);
    //console.log(err.stack);
    // _Migrations table doesn't exist, assuming rebase mode
    return db.query(self.getCreateMigrationSQL()).then(function() {
      // rerun all migrations
      return self.run(db);
    });
  });
};

/**
 * Dump current ModelsJson into last migration
Migrator.prototype.dump = function(db) {
  var self = this;
  return db.scalar('_Migration', {
    field: 'uid',
    order: {
      uid: 'DESC'
    },
    limit: 1
  }).then(function(lastUid) {
    return db.update('_Migration', { models: self.getModelsJSON() }, { uid: lastUid });
  });
};
 */

module.exports = Migrator;
