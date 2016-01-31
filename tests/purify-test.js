var fs = require('fs');
var path = require('path');
var should = require('should');
var purify = require('../lib/purify.js');
var input = require('./case-purify/input.json');

if (require.main == module) {
  var output = purify(input);
  console.log(JSON.stringify(output, null, 2));
} else {
  describe('Purify test', function() {
    it('Convert entities to tables', function() {
      var output = purify(input);
      var expected = require('./case-purify/output.json');
      should(output).be.deepEqual(expected);
    });
  });
}
