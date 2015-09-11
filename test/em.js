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

describe('Basic Function, create database and insert data', function() {
  em.remove().then(function() {
    return em.createOrMigrate();
  }).then(function() {
    return em.scope(function(db) {
      return db.insert('User', {
        nick: 'klesh',
        isAdmin: true,
        email: 'klesh@qq.com'
      }).then(function() {
        return db.find('User', {nick: 'klesh'});
      });
    }).then(function(user) {
      user.nick.should.be.exactly('klesh');
      user.isAdmin.should.be.true();
      user.email.should.be.exactly('klesh@qq.com');
    });
  });
});
