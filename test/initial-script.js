var should = require('should');
var sql = require('../lib/sql-generator.js');
var path = require('path');
var runner = require('./common/json-to-sql-cases-runner.js');


var casesDirPath = path.resolve(__dirname, 'case-initial');


if (require.main == module) {
  // to generate well formatted sql file
  // generate script then and try run in database server, write to disk if everything went fine...
  runner.generate(casesDirPath, function(definition) {
    return sql.initialScript('pg', definition);
  });
} else {
  // run all definition convertion, compare to existing sql file(the one we are sure is well formatted).
  describe('SqlGenerator Test', function() {
    runner.runTests(casesDirPath, function(definition) {
      return sql.initialScript('pg', definition);
    });
  });
}
