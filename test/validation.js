var em = require('../index.js');
var should = require('should');
var shouldPromised = require('should-promised');
var path = require('path');
var Promise2 = require('bluebird');

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

  it('message', function() {
    var User = em.define('User', {
      nick: { type: 'string', allowNull: false, message: 'Please enter nick' }
    });

    return new User().validate().should.be.rejected();
  });

  it('allowNull', function() {
    var User = em.define('User', {
      nick: { type: 'string', allowNull: false }
    });

    var user = new User({ nick: '' });
    return user.validate().should.be.rejectedWith({ propertyName: 'nick' });
  });
  
  it('length', function() {
    var User = em.define('User', {
      nick: { type: 'string', length: 5 }
    });

    var user = new User({ nick: 'a very long nick' });
    return user.validate().should.be.rejectedWith({ propertyName: 'nick' });
  });

  it('number type', function() {
    var User = em.define('User', {
      age: { type: 'int' }
    });

    var user = new User({ age: 'fifty' });
    return user.validate().should.be.rejected();
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
    var message = 'Please enter valid email address' ;
    var User = em.define('User', {
      email: { type: 'string', length: 50, isEmail: true, message: message}
    });
    
    var user = new User({ email: 'notaemail' });
    return user.validate().should.be.rejectedWith({ propertyName: 'email', description: message });
  });

  it('matches', function() {
    var User = em.define('User', {
      nick: { type: 'string', length: 50, matches: /^\w{5,8}$/, description: 'Nick should be consist by 5~8 letters' }
    });
    var user = new User({ nick: 'abcdefghijkl,n' });
    return user.validate().should.be.rejectedWith({ propertyName: 'nick' });
  });

  it('update validation by autoIncrement column', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string', length: 50, allowNull: false },
      lastLogonAt: { type: 'timestamptz' }
    });

    var user = new User({ id: 100, lastLogonAt: new Date() });
    return user.validate().should.be.fulfilled();
  });

  it('update validation by passing true', function() {
    var User = em.define('User', {
      nick: { type: 'string', length: 50, allowNull: false, primaryKey: true },
      lastLogonAt: { type: 'timestamptz' }
    });

    var user = new User({ nick: 'someone', lastLogonAt: new Date() });
    return user.validate(true).should.be.fulfilled();
  });

  it('fix value', function() {
    var User = em.define('User', {
      age: { type: 'int' }
    });
    var user = new User({ age: '12' });
    user.fix().then(function() {
      user.age.should.be.exactly(12);
      user.age.should.be.Number();
    });
  });

  it('abort by event after validation', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string', length: 50 }
    });
    User.beforeInsert = function(data) {
      return Promise2.reject({ message: 'rejecthaha' });
    };

    User.save({ nick: 'haha' }).should.be.rejectedWith('rejecthaha');
  });
});
