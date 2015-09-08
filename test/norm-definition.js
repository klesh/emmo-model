var fs = require('fs');
var path = require('path');
var should = require('should');
var normDef = require('../lib/norm-definition.js');
var input = require('./case-norm-definition/input.json');

if (require.main == module) {
  // to ouput normalized definition, use pipe command to write to output.json if result is fine.
  var output = normDef(input);
  console.log(JSON.stringify(output, null, 2));
} else {
  describe('Definition normalization test', function() {
    it('convert user definition to standard format', function() {
      var output = normDef(input);
      var expected = require('./case-norm-definition/output.json');

      var outputJson = JSON.stringify(output);
      var expectedJson = JSON.stringify(expected);
      outputJson.should.be.exactly(expectedJson);
    });
  });
}
