var _ = require('lodash');
var moment = require('moment');

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
                          script: fs.readFileSync(path.resolve(migrationsPath, f))
                        };
                      }).sortBy('uid');
}

Migrator.prototype.lastMigrationData = function() {
  var data;
  if (this.migrations && this.migrations.length) {
    data = _.pick(this.migrations.last(), ['uid', 'name']);
  } else {
    var uid = moment().format('YYYYMMDDHHmmss');
    data = { uid: uid, name: uid + '-InitialCreate' };
  }

  data.models = this.normalizedJson;
  return data;
};

Migrator.prototype.run = function(db) {
  var self = this;
  return db.selectOne('_Migration', {field: 'uid', order: {uid: 'DESC'}, limit: 1})
    .then(function(dbLastMigration) {
      var pendingMigrations = self.migrations.filter(function(migration) { 
        return migration.uid > lastMigrationUid;
      });

      return Promise.map(pendingMigrations, function(migration) {
        return db.query(migration.script).then(function() {
          return db.insert('_Migration', {
            uid: migration.uid,
            name: migration.name,
            models: self.normalizedJson
          });
        });
      });
    });
};
