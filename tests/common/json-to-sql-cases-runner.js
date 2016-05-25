var fs = require('fs');
var path = require('path');
var P = require('bluebird');
var should = require('should');
var util = require('util');
var _ = require('lodash');
var colors = require('colors');
var EM = require('../../index.js');
var env = require('../env.js');

P.promisifyAll(fs);
P.longStackTraces();

var em = EM.new();
em.init(_.defaults({
  database: 'sql_gen_test'
}, env));

// read line from console
var readline = function(prompt) {
  console.log(prompt);
  return new P(function(resolve, reject) {
    process.stdin.resume();
    process.stdin.on('data', function(data) {
      process.stdin.pause();
      resolve(data[0] != 110);
    });
  });
};

const specifiedFile = process.argv[2];
// read definitions from target directory
var readdefs = function(path) {
  return fs.readdirSync(path).filter(function(f) {
    if (specifiedFile && f.split('.')[0] !== specifiedFile)
      return false;

    return /\.json$/.test(f);
  }).map(function(f) {
    return { 
      fileName: f, 
      definition: require(path + '/' + f)
    };
  });
};

// get expected sql script file path
var getExpectPath = function(casesDirPath, fileName) {
  return path.resolve(casesDirPath, path.basename(fileName, '.json') + '.' + env.dialect + '.sql');
};


var generateResult = function(casesDirPath, getScript, initScript) {
  return P.each(readdefs(casesDirPath), function(def) {
    var sqlScript = getScript(def.definition);
    console.log('\n*** CASE ' + def.fileName + ':'.green);

    // recreate database to keep things neat.
    return em.dropCreate().then(function() {
      // run sql script on database to make sure it's ok.
      return em.scope(function(db) {
        var promise;
        if (initScript) {
          // run initial script before current script if specified
          var init = initScript(def.definition);
          console.log(init.grey); // print initial script in grey color.
          promise = db.query(init);
        } else {
          promise = P.resolve();
        }

        // run target script.
        return promise.then(function() {
          console.log(sqlScript);
          return db.query(sqlScript);
        });
      }).then(function() {
        return readline('*** Does generated sql script seems alright (Y/n)'.green);
      }).then(function(ok) {
        if (!ok)
          return;

        // write generated sql script to file.
        return fs.writeFileAsync(getExpectPath(casesDirPath, def.fileName), sqlScript);
      });
    });
  }).then(function() {
    console.log('Done');
    process.exit(0);
  });
};

var runTests = function(casesDirPath, getScript) {
  readdefs(casesDirPath).forEach(function(def) {
    it(def.fileName, function() {
      var actualScript = getScript(def.definition);
      var expectScript = fs.readFileSync(getExpectPath(casesDirPath, def.fileName)).toString();
      actualScript.should.be.exactly(expectScript);
    });
  });
};

exports.generate = generateResult;
exports.runTests = runTests;
