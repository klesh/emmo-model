var fs = require('fs');
var path = require('path');
var em = require('../index.js');
var Promise2 = require('bluebird');
var _ = require('lodash');
var should = require('should');
var User = require('./models/user.js');
var Role = require('./models/role.js');
var Department = require('./models/department.js');

var jsonPath = path.resolve('./em.json');
var database;

describe('EmmoModel', function() {
  before('sync', function() {
    this.timeout(10 * 1000);
    var json = require('../tpl/em.json');
    json.modelsPath = 'test/models';
    json.migrationsPath = 'test/migrations';
    if (process.env.PGCONNECT) {
      json.connectionString = process.env.PGCONNECT;
    }
    fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
    database = json.database;
    if (!database) throw new Error('database can not be empty in tpl/em.json');
    em.init();
    return Promise2.all(_.map([ database, 'emtest1' ], function(name) {
      return em.remove(name);
    })).finally(function() {
      var readyTriggered = false;
      em.once('ready', function() {
        readyTriggered = true;
      });
      return em.sync().then(function() {
        should(readJson().all).be.deepEqual([ database ]);
        should(readyTriggered).be.true();
        return em.create('emtest1');
      }).then(function() {
        should(readJson().all).be.deepEqual([ database, 'emtest1' ]);
      });
    });
  });

  function readJson() {
    return JSON.parse(fs.readFileSync(jsonPath).toString());
  }

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
    return User.insert({ nick: 'sutest', age: 13 }).then(function(user) {
      should(user.id).be.ok();
      return User.save({ nick: 'sutest2', age: em.o('age').plus(5), id: user.id }).thenReturn(user.id);
    }).then(function(userId) {
      return User.find(userId);
    }).then(function(user) {
      should(user.nick).be.exactly('sutest2');
      should(user.age).be.exactly(18);
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
        return Role.paginate({ size:2, page:1, field: [ 'id', 'name'], order: { 'id': 'DESC' } });
      }).then(function(page1) {
        should(page1.length).be.exactly(2);
        should(page1[0].name).be.exactly('Role6');
        should(page1[1].name).be.exactly('Role5');
        should(_.keys(page1[0]).length).be.exactly(2);
        return Role.paginate({ size:2, page:3, field: [ 'id', 'name' ], order: { 'id': 'DESC' } });
      }).then(function(page3) {
        should(page3[0].name).be.exactly('Role2');
        should(page3[1].name).be.exactly('Role1');
      });
  });

  it('or and in', function() {
    return Promise2.each([
      { nick: 'OR1' },
      { nick: 'OR2' }
    ], function(user) {
      return User.insert(user);
    }).then(function() {
      return User.all({ where: [ { nick: 'OR1' }, { nick: 'OR2' } ] });
    }).then(function(users) {
      should(users.length).be.exactly(2);
      return User.all({ where: { nick: [ 'OR1', 'OR2' ] } });
    }).then(function(users) {
      should(users.length).be.exactly(2);
    });
  });

  it('alias', function() {
    return User.insert({ nick: 'aliastest', age: 22 })
      .then(function(user) {
        return User.one({ field: { name: 'nick', aged: em.o('age').plus(30) }, where: { id: user.id } });
      })
      .then(function(user) {
        should(user.name).be.exactly('aliastest');
        should(user.aged).be.exactly(52);
      });
  });

  it('count', function() {
    return User.scalar({ field: em.count() })
    .then(function(total) {
      should(total * 1).be.Number();
    });
  });
  
  it('avg', function() {
    return em.scope(function(db) {
      return Promise2.each([1, 2, 3, 4], function(age) {
        return db.insert('User', { nick: 'avgtest' + age, age: age, email: 'avgtest@test.com' });
      }).then(function() {
        return db.scalar('User', { field: em.avg('age'), where: { email: 'avgtest@test.com' } });
      });
    }).then(function(avg) {
      should(avg * 1).be.exactly(2.5);
    });
  });

  it('groupby having', function() {
    var deptId;
    return em.scope(function(db) {
      return db.insert('Department', { title: 'grouptest' })
      .then(function(dept) {
        deptId = dept.id;
        return Promise2.each([1, 2, 3, 4], function(i) {
          return db.insert('User', { nick: 'ghtest' + i, departmentId: dept.id });
        });
      })
      .then(function(){
        return db.scalar('User', { 
          field: 'departmentId',
          groupby: 'departmentId',
          having: {
            _: [ em.count(), 4 ]
          }
        });
      });
    }).then(function(rs) {
      should(rs).be.exactly(deptId);
    });
  });
});
