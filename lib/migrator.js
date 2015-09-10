var SqlGenerator = require('./sql-generator.js');

// to provide migration generation, and run migration.

function Migrator(migrationsPath)  {
  this.migrations = fs.readdirSync(migrationsPath)
                      .filter(function(f) { return  /\.sql$/.test(f); })
                      .map(function(f) { 
                        
                      });
}

Migrator.prototype.lastMigrationData = function() {
  
};
