var EM = require('../index.js');
var _ = require('lodash');
var should = require('should');
var shouldPromised = require('should-promised');
var env = require('./env.js');
var util = require('util');

describe('rebase tests (for legacy database merging)', function() {
  var em = EM.new();
  em.init(Object.assign({}, env, {
    database: 'em_legacy'
  }));

  em.define('User', {
    id: { type: 'int', unsigned: true, autoIncrement: true, primaryKey: true },
    name: { type: 'string', length: 50 }
  });

  before('remove previous testing database', function() {
    return em.remove('em_legacy');
  });

  before('create a LEGACY database', function() {
    return em.sync().then(() => {
      return em.scope(db => db.query(util.format('DROP TABLE %s', em.agent.quote('_Migrations'))));
    });
  });

  it('_Migrations should be re-created automatically', function() {
    return em.sync().then(function() {
      return em.scope(db => db.count('_Migration')).should.be.fulfilled();
    });
  });
});
