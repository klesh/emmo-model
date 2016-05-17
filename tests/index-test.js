var fs = require('fs');
var path = require('path');
var em = require('../index.js');
var P = require('bluebird');
var _ = require('lodash');
var should = require('should');
var User = require('./models/user.js');
var Role = require('./models/role.js');
var Department = require('./models/department.js');

/**
 * prepare config file
 */
var connectionString = process.env.CONNECTION_STRING || 'postgres://kleshwong@localhost/%s';
var dialect = process.env.DIALECT || 'pg';

var json = require('../tpl/em.json');
var jsonPath = path.resolve(`./tests/configs/em.${dialect}.json`);
var database;

P.longStackTraces();

describe('EmmoModel Test', function() {
  before('sync', function() {
    this.timeout(10 * 1000);

    // create config file
    json.modelsPath = 'tests/models';
    json.migrationsPath = 'tests/migrations';
    json.connectionString = connectionString;
    json.dialect = dialect;
    fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
    database = json.database;
    if (!database) throw new Error('database can not be empty in tpl/em.json');

    // bootstrap em
    em.init(jsonPath);

    // remove all test database if exists
    return P.all(_.map([ database, 'emtest1' ], function(name) {
      return em.remove(name);
    })).finally(function() {
      var readyTriggered = false, createdTriggered;
      em.once('ready', function() {
        readyTriggered = true;
      });
      em.once('created', function() {
        createdTriggered = true;
      });
      return em.sync().then(function() {
        should(readJson().all).be.deepEqual([ database ]);
        should(readyTriggered).be.true();
        return em.create('emtest1');
      }).then(function() {
        should(createdTriggered).be.true();
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
      should(user3.isAdmin).be.ok();
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

  it('refresh', function() {
    var userId;
    return User.insert({ nick: 'refresh-test' }).then(function(user) {
      return User.find(user.id);
    }).then(function(user) {
      should(user.updatedAt).not.be.ok();
      userId = user.id;
      return User.refresh({ nick: 'refresh-test', id: userId });
    }).then(function(user) {
      return User.find(userId);
    }).then(function(user) {
      should(user.updatedAt).not.be.ok();
      return User.refresh({ id: user.id, age: 22 });
    }).then(function() {
      return User.find(userId);
    }).then(function(user) {
      should(user.updatedAt).be.ok();
    });
  });

  it('like', function() {
    return P.each([
      { nick: 'like1like' },
      { nick: 'like2like' },
      { nick: 'like3like' }
    ], User.insert.bind(User)).then(function() {
      return User.count({ nick: em.startsWith('like1') });
    }).then(function(count) {
      should(count).be.exactly(1);
      return User.count({ nick: em.like('1like', 'end') });
    }).then(function(count) {
      should(count).be.exactly(1);
      return User.count({ nick: em.like('like') });
    }).then(function(count) {
      should(count).be.exactly(3);
    });
  });

  it('all/paginate', function() {
    return P.each([
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

  it('or/in/not', function() {
    return P.each([
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
      return User.all({ where: { nick: em.not(em.in('OR1', 'OR2')) } });
    }).then(function(users) {
      should(_.find(users, 'nick', 'OR1')).not.be.ok();
      should(_.find(users, 'nick', 'OR2')).not.be.ok();
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

  it('array', function() {
    return P.resolve([1,2,3,4]).each(function(i) {
      return User.insert({ nick: 'array' + i, age: 1000 });
    }).then(function() {
      return User.array({
        field: 'nick',
        where: { age: '1000' },
        order: 'id'
      });
    }).then(function(nicks) {
      should(nicks).be.deepEqual([ 'array1', 'array2', 'array3', 'array4' ]);
    });
  });
  
  it('avg', function() {
    return em.scope(function(db) {
      return P.each([1, 2, 3, 4], function(age) {
        return db.insert('User', { nick: 'avgtest' + age, age: age, email: 'avgtest@test.com' });
      }).then(function() {
        return db.scalar('User', { field: em.avg('age'), where: { email: 'avgtest@test.com' } });
      });
    }).then(function(avg) {
      should(avg * 1).be.exactly(2.5);
    });
  });

  it('join groupby having', function() {
    var deptId;
    return em.scope(function(db) {
      return db.insert('Department', { title: 'grouptest' })
      .then(function(dept) {
        deptId = dept.id;
        return P.each([1, 2, 3, 4], function(i) {
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
      return User.all({ join: 'Department', where: { 'Department.title': 'grouptest' } });
    }).then(function(users) {
      should(users.length).be.exactly(4);
    });
  });
});
