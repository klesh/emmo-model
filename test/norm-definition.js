var should = require('should');
var normDef = require('../lib/norm-definition.js');
var input = require('./norm-definition-cases/input.json');

if (require.main == module) {
  var output = normDef(input);
  console.log(JSON.stringify(output, null, 2));
}
