var path = require('path');
var em = require('../index.js');
var should = require('should');

em.init({
  modelsPath: path.resolve(__dirname, 'models'),
  migrationsPath: path.resolve(__dirname, 'migrations'),
  dialect: 'pg',
  connectionString: '/var/run/postgresql %s',
  database: 'emtest'
});

describe('EmmoModel Test', function() {
  it('Basic Function, create database and insert data', function(){
    return em.remove().finally(function() {
      return em.createOrMigrate();
    }).then(function() {
      var user = {
        nick: 'klesh',
        isAdmin: true,
        email: 'klesh@qq.com'
      };
      return em.scope(function(db) {
        return db.insert('User', user).then(function(user) {
          return db.update('User', {email: '13794207@qq.com'}, {id: user.id});
        }).then(function() {
          return db.find('User', {id: user.id});
        });
      }).then(function(user) {
        user.id.should.be.ok();
        user.nick.should.be.exactly('klesh');
        user.isAdmin.should.be.true();
        user.email.should.be.exactly('13794207@qq.com');
      });
    });
  });
});
