var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');
var pg = require('pg');
var should = require('should');
var util = require('util');
var _ = require('lodash');
var colors = require('colors');

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
    fileNames = _.filter(fileNames, function(f) { 
      if (baseName && baseName != path.basename(f, '.json'))
        return false;
      return jsonPatt.test(f); 
    });

    var chain = Promise.resolve();

    _.forEach(fileNames, function(fileName) {
      chain = chain.then(function() {
        var definition = require(casesDirPath + '/' + fileName);
        var script = getScript(definition);
        var title = '*** CASE ' + fileName + ':';
        console.log('');
        console.log(title.green);
        
        return pg.connectAsync(getConnectionString())
          .spread(function(client, release) {
            return client.queryAsync('DROP DATABASE IF EXISTS sql_gen_test;')
              .then(function() { return client.queryAsync('CREATE DATABASE sql_gen_test;'); })
              .then(release)
              .then(function() {
                return new Promise(function(resolve, reject) {
                  var client2 = new pg.Client(getConnectionString('sql_gen_test'));
                  client2.connect(function(err) {
                    if (err)
                      return reject(err);
                    return resolve([ client2, client2.end.bind(client2) ]);
                  });
                });
              })
              .spread(function(client2, release2) { 
                var promise;
                if (initScript) {
                  var init = initScript(definition);
                  console.log(init.grey);
                  promise = client2.queryAsync(init);
                } else {
                  promise = Promise.resolve();
                }
                return promise.then(function() {
                  console.log(script);
                  return client2.queryAsync(script);
                }).finally(release2);
              })
              .then(function() {
                return readline('*** Does generated sql script seems right(Y/n)?'.red)
                  .then(function(positive) {
                    if (!positive) return;

                    var p = path.resolve(casesDirPath, path.basename(fileName, '.json') + '.sql');
                    fs.writeFileSync(p, script);
                  });
              });
          });
      });
    });

    chain.then(function() {
      console.log('Done');
      process.exit(0);
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
