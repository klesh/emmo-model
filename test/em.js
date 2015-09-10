var path = require('path');
var em = require('../index.js');
var should = require('should');

em.init({
  modelsPath: path.resolve(__dirname, 'models'),
  migrationsPath: path.resolve(__dirname, 'migrations'),
  dialect: 'pg',
  connectionString: '/var/run/postgresql %s',
  database: 'hh'
});

console.log(em.definition);

em.createOrMigrate().then(function() {
  em.exec(function(db) {
    return db.User.create({
      nick: 'klesh',
      isAdmin: true,
      email: 'klesh@qq.com'
    }).then(function() {
      return db.User.find({nick: 'klesh'});
    }).then(function(user){
      user.nick.should.be.exactly('klesh');
      user.isAdmin.should.be.true();
      user.email.should.be.exactly('klesh@qq.com');
    });
  });
});
