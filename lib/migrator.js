var _ = require('lodash');
var moment = require('moment');
var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');

// to provide migration generation, and run migration.

function Migrator(options)  {
  _.extend(this, {
    pattern: /((\d{14})-.*?)\.sql$/
  }, options);

  var self = this;
  this.migrations = fs.readdirSync(this.migrationsPath)
                      .filter(function(f) { return self.pattern.test(f); })
                      .map(function(f) { 
                        var m = self.pattern.exec(f);
                        return {
                          uid: m[2],
                          name: m[1],
                          fileName: f,
                          script: fs.readFileSync(path.resolve(self.migrationsPath, f)).toString()
                        };
                      });
  this.migrations = _.sortBy(this.migrations, 'uid');
}

Migrator.prototype.lastMigrationData = function() {
  var data;
  if (this.migrations && this.migrations.length) {
    data = _.pick(_.last(this.migrations), ['uid', 'name']); // accept only newer than last migration
  } else {
    data = { uid: 0, name: '00000000000000-InitialCreate' }; // accept any new migration in the future
  }

  data.models = this.normalizedJson;
  return data;
};

Migrator.prototype.run = function(db) {
  var self = this;
  
  return db.selectOne('_Migration', {field: 'uid', order: {uid: 'DESC'}, limit: 1})
    .then(function(dbLastMigration) {
      var pendingMigrations = self.migrations.filter(function(migration) { 
        return migration.uid > dbLastMigration.uid;
      });
      
      return Promise.each(pendingMigrations, function(migration) {
        return db.query(migration.script);
      });
    });
};

module.exports = Migrator;
