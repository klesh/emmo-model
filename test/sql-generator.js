var should = require('should');
var util = require('util');
var SqlGenerator = require('../lib/sql-generator.js');
var fs = require('fs');
var path = require('path');
var jsonPatt = /.json$/;

var casesDirPath = path.resolve(__dirname, 'sql-generator-cases');
var connectionString = '/var/run/postgresql %s';


if (require.main == module) {
  var Promise = require('bluebird');
  var pg = require('pg');
  Promise.promisifyAll(pg);
  Promise.longStackTraces();

  var getConnectionString = function(database) {
    database = database || 'postgres';
    return util.format(connectionString, database);
  };

  var readline = function(prompt) {
    console.log(prompt);
    return new Promise(function(resolve, reject) {
      process.stdin.resume();
      process.stdin.on('data', function(data) {
        process.stdin.pause();
        resolve(data[0] != 110);
      });
    });
  };


  fs.readdir(casesDirPath, function(err, fileNames) {
    Promise.map(fileNames, function(fileName) {
      if (jsonPatt.test(fileName)) {
        var definition = require('./sql-generator-cases/' + fileName);
        var sqlGen = new SqlGenerator('pg', definition);
        var script = sqlGen.createDatabase();
        
        return pg.connectAsync(getConnectionString())
          .spread(function(client, release) {
            console.log('*** CASE ' + fileName + ':');
            console.log('');
            console.log(script);
            return client.queryAsync('DROP DATABASE IF EXISTS sql_gen_test;')
              .then(function() { return client.queryAsync('CREATE DATABASE sql_gen_test;'); })
              .then(release)
              .then(function() {
                return pg.connectAsync(getConnectionString('sql_gen_test'));
              })
              .spread(function(client2, release2) { 
                return client2.queryAsync(script).then(release2); 
              })
              .then(function() {
                console.log('');
                return readline('*** Does generated sql script seems right(Y/n)?')
                  .then(function(positive) {
                    if (!positive) return;

                    var p = path.resolve(casesDirPath, path.basename(fileName, '.json') + '.sql');
                    fs.writeFileSync(p, script);
                  });
              });
          });
      }
    });
  });
} else {
  describe('SqlGenerator Test', function() {
    fs.readdir(path.resolve(casesDirPath), function(err, fileNames) {
      fileNames.forEach(function(fileName) {
        if (!jsonPatt.test(fileName)) return;

        it(fileName, function() {
          var sqlGen = new SqlGenerator('pg', require('./sql-generator-cases/' + fileName));
          var actualScript = sqlGen.createDatabase();
          var expectPath = path.resolve(casesDirPath, path.basename(fileName, '.json') + '.sql');
          var expectScript = fs.readFileSync(expectPath);
          actualScript.should.be.exactly(expectScript);
        });
      });
    });
  });
}
