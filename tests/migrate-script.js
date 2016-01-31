var should = require('should');
var sql = require('../lib/sql.js');
var path = require('path');
var runner = require('./common/json-to-sql-cases-runner.js');

var casesDirPath = path.resolve(__dirname, 'case-migrate');

if (require.main == module) {
  // to generate well formatted sql file
  // generate script then and try run in database server, write to disk if everything went fine...
  runner.generate(casesDirPath, function(data) {
    return sql.migrateScript('pg', data.old, data.new);
  }, function(data) {
    return sql.initialScript('pg', data.old);
  });
} else {
  // run all definition convertion, compare to existing sql file(the one we are sure is well formatted).
  describe('SqlGenerator Test', function() {
    runner.runTests(casesDirPath, function(data) {
      return sql.migrateScript('pg', data.old, data.new);
    });
  });
}
