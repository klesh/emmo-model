var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');
var pg = require('pg');
var should = require('should');
var util = require('util');

Promise.promisifyAll(pg);
Promise.longStackTraces();
  
var jsonPatt = /.json$/;
var connectionString = '/var/run/postgresql %s';
var baseName = process.argv[2];

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

var generateResult = function(casesDirPath, getScript, initScript) {
  fs.readdir(casesDirPath, function(err, fileNames) {
    Promise.map(fileNames, function(fileName) {

      if (jsonPatt.test(fileName)) {
        if (baseName && baseName != path.basename(fileName, '.json')) {
          return;
        }
        var definition = require(casesDirPath + '/' + fileName);
        var script = getScript(definition);
        
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
                var promise;
                if (initScript) {
                  promise = client2.queryAsync(initScript(definition));
                } else {
                  promise = Promise.resolve();
                }
                return promise.then(function() {
                  return client2.queryAsync(script);
                }).finally(release2);
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
};

var runTests = function(casesDirPath, getScript) {
  fs.readdirSync(casesDirPath).forEach(function(fileName) {
    if (!jsonPatt.test(fileName)) return;

    it(fileName, function() {
      var actualScript = getScript(require(casesDirPath + '/' + fileName));
      var expectPath = path.resolve(casesDirPath, path.basename(fileName, '.json') + '.sql');
      var expectScript = fs.readFileSync(expectPath).toString();
      actualScript.should.be.exactly(expectScript);
    });
  });
};

exports.generate = generateResult;
exports.runTests = runTests;
