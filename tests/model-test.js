var em = require('../index.js');
var should = require('should');
var shouldPromised = require('should-promised');
var path = require('path');
var Promise2 = require('bluebird');

describe('Model test', function() {
  //var em = EM.new();

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
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string', allowNull: false, message: 'Please enter nick' },
      age: { type: 'int' }
    });

    return new User({age: 22}).validate('insert').should.be.rejectedWith({ message: 'Please enter nick' });
  });

  it('empty data', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string' }
    });

    return new User({ age: 22 }).validate('insert').should.be.rejectedWith({ code: 'E_DATA_EMPTY' });
  });

  it('insert validate', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string', length: 50 }
    });

    var user = new User({ nick: 'a very long nick' });
    return user.validate('insert').should.be.fulfilled();
  });

  it('update validate', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string' }
    });

    return new User({ nick: 'abc' }).validate('update').should.be.rejectedWith({ code: 'E_VALIDATION_FAIL' });
  });
  
  it('length', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string', length: 5 }
    });

    var user = new User({ nick: 'a very long nick' });
    return user.validate('insert').should.be.rejectedWith({ code: 'E_VALIDATION_FAIL' });
  });
  
  it('isLength', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string', length: 50, isLength: { min: 5 } }
    });

    var user = new User({ nick: 'a' });
    return user.validate('insert').should.be.rejectedWith({ code: 'E_VALIDATION_FAIL' });
  });

  it('number type', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      age: { type: 'int' }
    });

    should.throws(function() {
      User.assign({}, { age: 'fifty' });
    }, function(err) {
      should(err.code).be.exactly('E_TYPE_ERROR');
      return true;
    });

    User.assign(new User(), { age: '22' }).age.should.be.exactly(22);
  });

  it('timestamp type', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      createdAt: { type: 'timestamptz', dateFormat: 'YYYY-MM-DD HH:mm:ss' },
      updatedAt: { type: 'timestamp' }
    });

    should.throws(function() {
      User.assign({}, { createdAt: 'fifty' });
    }, function(err) {
      should(err.code).be.exactly('E_TYPE_ERROR');
      return true;
    });
    
    User.assign(new User(), { createdAt: '2015-10-10 10:10:10' }, true).createdAt.should.be.ok();
  });

  it('isEmail', function() {
    var message = 'Please enter valid email address' ;
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      email: { type: 'string', length: 50, isEmail: true, message: message}
    });
    
    return new User({ email: 'abc' }).validate('insert').should.be.rejectedWith({ description: message });
  });

  it('matches', function() {
    var User = em.define('User', {
      id: { type: 'int', autoIncrement: true, primaryKey: true },
      nick: { type: 'string', length: 50, matches: /^\w{5,8}$/, description: 'Nick should be consist by 5~8 letters' }
    });
    var user = new User({ nick: 'abcdefghijkl,n' });
    return user.validate('insert').should.be.rejected();
  });
});
