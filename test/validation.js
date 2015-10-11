var em = require('../index.js');
var should = require('should');
var path = require('path');

describe('Validation test', function() {
  before(function() {
    em.init({
      modelsPath: path.resolve(__dirname, 'models'),
      migrationsPath: path.resolve(__dirname, 'migrations'),
      dialect: 'pg',
      connectionString: '/var/run/postgresql %s',
      database: 'emtest'
    });
  });

  function shouldNotCall() {
    should.fail();
  }

  function shouldError(err) {
    err.should.be.ok();
  }

  function shouldPropertyError(err) {
    shouldError(err);
    should(err.propertyName).be.ok();
    should(err.description).be.ok();
    err.message.should.be.exactly(err.description);
  }

  it('message', function() {
    var User = em.define('User', {
      nick: { type: 'string', allowNull: false, message: 'Please enter nick' }
    });

    return new User().validate().then(shouldNotCall).catch(function(err) {
      shouldPropertyError(err);
      err.description.should.be.exactly(User.prototype._definition.columns.nick.message);
    });
  });

  it('allowNull', function() {
    var User = em.define('User', {
      nick: { type: 'string', allowNull: false }
    });

    var user = new User({ nick: '' });
    return user.validate().then(shouldNotCall).catch(shouldPropertyError);
  });
  
  it('length', function() {
    var User = em.define('User', {
      nick: { type: 'string', length: 5 }
    });

    var user = new User({ nick: 'a very long nick' });
    return user.validate().then(shouldNotCall).catch(shouldPropertyError);
  });

  it('number type', function() {
    var User = em.define('User', {
      age: { type: 'int' }
    });

    var user = new User({ age: 'fifty' });
    return user.validate().then(shouldNotCall).catch(shouldError);
  });

  it('timestamp type', function() {
    var User = em.define('User', {
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamp' }
    });

    var user1 = new User({ createdAt: '2015-10-10 12:01:13' });
    return user1.validate().then(function() {
      user1.createdAt._isAMomentObject.should.be.true();
    });
  });

  it('isEmail', function() {
    var User = em.define('User', {
      email: { type: 'string', length: 50, isEmail: true, message: 'Please enter valid email address' }
    });
    
    var user = new User({ email: 'notaemail' });
    return user.validate().then(shouldNotCall).catch(shouldPropertyError);
  });

  it('matches', function() {
    var User = em.define('User', {
      nick: { type: 'string', length: 50, matches: /^\w{5,8}$/, message: 'Nick should be consist by 5~8 letters' }
    });
    var user = new User({ nick: 'abcdefghijkl,n' });
    return user.validate().then(shouldNotCall).catch(shouldPropertyError);
  });
});
