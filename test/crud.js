var path = require('path');
var em = require('../index.js');
var should = require('should');
var User = require('./models/user.js');
var Role = require('./models/role.js');
var Department = require('./models/department.js');
var Promise2 = require('bluebird');
var _ = require('lodash');

em.init({
  modelsPath: path.resolve(__dirname, 'models'),
  migrationsPath: path.resolve(__dirname, 'migrations'),
  dialect: 'pg',
  connectionString: '/var/run/postgresql %s',
  database: 'emtest'
});

describe('Single database mode', function() {
  before('init database', function() {
    return em.dropCreate();
  });

  it('insert/select/update/delete', function() {
    var user = { nick: 'emtest', isAdmin: true, email: 'emtest@test.com' };
    var department = { title: 'testrole' };
    return User.insert(user).then(function(user2) {
      should(user.id).be.ok();
      should(user).be.exactly(user2);
      return User.find(user.id);
    }).then(function(user3) {
      should(user3).be.ok();
      should(user3.id).be.equal(user.id);
      should(user3.nick).be.exactly('emtest'); 
      should(user3.isAdmin).be.true();
      should(user3.email).be.exactly('emtest@test.com');
      should(user3.departmentId).not.be.ok();
      should(user3.createdAt).be.ok();
      return Department.insert(department);
    }).then(function() {
      should(department.id).be.ok();
      return User.update({ id: user.id, departmentId: department.id });
    }).then(function() {
      return User.find(user.id);
    }).then(function(user4) {
      should(user4.departmentId).be.ok();
      return User.delete({ id: user.id });
    }).then(function(ar) {
      should(ar).be.exactly(1);
      return User.find(user.id);
    }).then(function(user5) {
      should(user5).not.be.ok();
    });
  });

  it('save -> insert', function() {
    return User.save({ nick: 'sitest' }).then(function() {
      return User.find({ nick: 'sitest' });
    }).then(function(user) {
      should(user).be.ok();
    });
  }); 

  it('save -> update', function() {
    return User.insert({ nick: 'sutest' }).then(function(user) {
      should(user.id).be.ok();
      return User.save({ nick: 'sutest2', id: user.id }).thenReturn(user.id);
    }).then(function(userId) {
      return User.find(userId);
    }).then(function(user) {
      should(user.nick).be.exactly('sutest2');
    });
  });

  it('cell', function() {
    return User.insert({ nick: 'ctest' }).then(function(user) {
      should(user.id).be.ok();
      return User.cell('nick', 'ctest2', user.id).thenReturn(user.id);
    }).then(function(userId) {
      return User.find(userId);
    }).then(function(user) {
      should(user.nick).be.exactly('ctest2');
    });
  });

  it('all/paginate', function() {
    return Promise2.each([
        { name: 'Role1' },
        { name: 'Role2' },
        { name: 'Role3' },
        { name: 'Role4' },
        { name: 'Role5' },
        { name: 'Role6' }
      ], 
      function(role) {
        return Role.insert(role);
      }).then(function() {
        return Role.all();
      }).then(function(all) {
        should(all.length).be.exactly(6);
        return Role.paginate({ size:2, page:1, field: [ 'id', 'name'] });
      }).then(function(page1) {
        should(page1.length).be.exactly(2);
        should(page1[0].name).be.exactly('Role6');
        should(page1[1].name).be.exactly('Role5');
        should(_.keys(page1[0]).length).be.exactly(2);
        return Role.paginate({ size:2, page:3, field: [ 'id', 'name' ] });
      }).then(function(page3) {
        should(page3[0].name).be.exactly('Role2');
        should(page3[1].name).be.exactly('Role1');
      });
  });
});
