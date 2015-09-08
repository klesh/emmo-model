var fs = require('fs');
var path = require('path');
var createMigration = require('../lib/create-migration.js');
var SqlGenerator = require('../lib/sql-generator.js');

var casesDirPath = path.resolve(__dirname, 'case-migrations');
if (require.main == module) {
  fs.readdir(casesDirPath, function(fileName) {
    if (!/\.json$/.test(fileName))
      return;

    var data = require(casesDirPath + '/' + fileName);
    var sqlGen = new SqlGenerator();

  });
}
