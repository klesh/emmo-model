# emmo-model v1.0.0
a lightweight orm framework, supports shadowing databases.

## INSTALLATION

Install emmo-model-cli to help you generate necessary files
```bash
$ sudo npm install emmo-model-cli -g
```

Enter your project folder and install emmo-model and database connector(currently only pg available)

```bash
$ cd myproject
$ npm install emmo-model --save
$ npm install pg --save
$ em init
```
That would create `em.json` file, `models/` and `migrations/` folders in myproject/

## Usage

### define model

assume we have users in our system.
myproject/models/user.js
```js
var em = require('emmo-model');

var User = module.exports = em.define('User', {
  id: { type: 'bigint', autoIncrement: true, primaryKey: true }, // bigserial(postgres)
  account: { type: 'string', length: 50, allowNull: false, unique: true }, // varchar(50)
  firstName: { type: 'string', length: 50 },
  lastName: { type: 'string', length: 50 },
  roleId: { type: 'int', refer: 'Role', onDelete: 'CASCADE' }
  remark: { type: 'string' }, // text
  email: { type: 'string', isEmail: true, message: 'Please enter valid email' }
  createdAt: { type: 'timestamptz', defaultValue: 'now()' } // timestamptz
}, {
  getFullName: function() {
    return this.firstName + ' ' + this.lastName;
  }
});
```

assume we need a role base access control machanism.
myproject/models/role.js
```js
var em = require('emmo-model');

var Role = module.exports = em.define('Role', {
  id: { type: 'int', autoIncrement: true, primaryKey: true },
  name: { type: 'string', length: 50, allowNull: false },
  permissions: { type: 'json' }
})
```

then we need to make a Many-To-Mary relationship between user and role.
myproject/models/user-role.js 
```js
var em = require('emmo-model');

var UserRole = module.exports = em.define('UserRole' {
  userId: { type: 'bigint', refer: 'User', allowNull: false, onDelete: 'CASCADE', primaryKey: true }, // build up simple foreign key relationship
  roleId: { type: 'int', refer: 'Role', allowNull: false, onDelete: 'CASCADE', primaryKey: true }, // build up simple foreign key relationship
  disabled: { type: 'boolean' }
});
```

assume we need to log down who and when created/disabled the UserRole relationship.
myproject/models/user-role-log.js
```js
var em = require('emmo-model');

var UserRoleLog = module.exports = em.define('UserRoleLog', {
  id: { type: 'bigint', autoIncrement: true, primaryKey: true },
  userId: { type: 'bigint', refer: 'UserRole', allowNull: false, onDelete: 'CASCADE' }, // refer composite primary key
  roleId: { type: 'int', refer: 'UserRole', allowNull: false, onDelete: 'CASCADE' }, // emmo-model assumes that all columns refer same table is a composite foreign key
  operator: { type: 'string', length: 50 },
  operation: { type: 'string' },
  createdAt: { type: 'timestamptz', defaultValue: 'now()' }
});
```

assume we need to track down user's relationship
myproject/models/relation.js
```js
var em = require('emmo-model');

var Relation = module.exports = em.define('Relation', {
  userId: { type: 'bigint', refer: 'User', referName: 'FK_User_Relation_userId', onDelete: 'CASCADE', allowNull: false }, 
  // add referName to avoid the composite foreign key, you can also assign a same referName for multiple columns to declare a specific composite foreign key.
  relativeId: { type: 'bigint', refer: 'User', referName: true, onDelete: 'CASCADE', allowNull: false } 
  // or you can just give a TRUE to let emmo-model generate a referName for this specific column.
  description: { type: 'string', length: 50 }
});
```

### bootstrap
modify myproject/bin/www to bootstrap emmo-model before server start.
```js
var em = require('emmo-model');
var User = require('../models/user.js');

em.sync(function(isNew, databaseName) {
  if (isNew) { // to insert initial data;
    User.insert({ account: 'admin', password: 'hi' });
  }
  server.listen(4000);
});
```
Sync method will CREATE or MIGRATE database automatically.

### CRUD
myproject/routes/index.js

For multiple databases:
```js
var em = require('emmo-model');
var _ = require('lodash');
var User = require('../models/user.js');

route.get('/', function(req, res) {
  em.scope('db1', function(db) {
    return db.select('User', { 
      field: [ 'id', 'nick', 'age' ],
      where: { departmentId: [ '<', 100 ] }, 
      order: { id : 'DESC' },
      limit: 20,
      offset: (req.query.page) - 1 * 20
    })
  }).then(function(users) {
    res.json(users);
  })
});

route.post('/', function(req, res) {
  em.scope('db1', function(db) {
    return db.insert('User', req.body);
  }).then(function(user) {
    res.json({ insertedId: user.id });
  });
});

route.put('/:id', function(req, res) {
  em.scope('db1', function(db) {
    return db.update('User', req.body);
  }).then(function(affectedRows) {
    res.json({ updatedFields: _.keys(req.body) });
  });
});

route.delete('/:id', function(req, res) {
  em.scope('db1', function(db) {
    return db.delete('User', { id: req.params.id });
  }).then(function(affectedRows) {
    res.json({ affectedRows: affectedRows });
  });
});

route.post('/', function(req, res) {
  User.validate(req.body).then(function() {
    return em.scope(function(db) {
      return db.save('User', req.body);
    }).then(function() {
      res.json({ success: true });
    }).catch(function(err) {
      res.json({ success: false, error: err });
    });
  });
});
```
Or use shortcuts:
```js
var User = require('../models/user.js');

route.get('/', function(req, res) {
  User.allIn(req.params.database).then(function(users) {
    res.json(user);
  });
})
```

For single database:
```js
var User = require('../models/user.js');

route.get('/', function(req, res) {
  User.all().then(function (users) {
    res.json(user);
  });
})
```

## Utils

### em.mount(handler)
Return a wrapped middleware function. Used to convert a promise as a JSON API service.
All resolved result will be output in JSON format.
All rejected result will be output in JSON format WITH a 400 bad request status code.
```js
var Promise2 = require('bluebird');
app.get('/user', em.mount(function(req, res) {
  return User.find(req.params.id).then(function(user) {
    if (!user) return Promise2.reject({ code: 'ENOTFOUND', description: 'Can not find specified user, might be deleted during request' });
  });
}))
```

## EmmoModel
A EmmoModel instance represent a set of Models. The major difference to other orm framework is that EmmoModel supports multiple databases sharing same set of Models.

### define(modelName, columnsDef, methodsDef) -> constructor
Define a new Model

### sync([databaseNames|callback]) -> Promise
Ommited: (KEEP ALL DATABASES UP TO DAY) create or migrate all databases in em.json file;
String: create or migrate single database;
Array: create or migrate a set of databases;
Function: will be call when database is created or migrated, two arguments will be pass to it, first one is database name, second one is a bool indicate if database is brand new instead of migrated.

Create and initial database if it doesn't exists
```js
em.sync(function(isNew, name) {
    if (isNew) {
        
    }
})
```

### scope([databaseName], cb) -> Promise
Accept a callback function which must returns a Promise(bluebird) object contains database operations.
Scope will attach a function to release database connection and return result to further actions.
```js
em.scope(function(session) {
  return session.find('User', { id: 1 })
    .then(function(user) {
      user.remark = 'new remark';
      return session.update('User', user);
    })
}).then(function() {
  console.log('User is updated successfully and connection was release.');
})
```

### create(databaseName) -> Promise
Create and initial database.

### remove(databaseName) -> Promise
Remove database.

### initial(databaseName) -> Promise
Run initial sql script on database to build up tables/indexes/foreignkeys according to Models definition.

### saveChange(isCreated, databaseName)
Add/Remove database in em.json file

### migrate(databaseName) -> Promise
Run pending migrations, executed migrations will be ignored.

### spawn(options)
Create new EmmoModel instance with same models definition as current one.
Useful when you working with different data server.

## Session
Represent a database connection, to perform database CRUD operations.

### find(modelName, where)
Shorthand to selectOne which _where_ indicates one row only.
```js
em.scope(function(db) {
  return db.find('User', { id: 1 });
}).then(function(user) {
  console.log(user);
})
```

### select(modelName, options)
Return multiple model rows.
```js
em.scope(function(db) {
  return db.select('User', { where: { roleId: [ 'in', [1, 2, 3] ] } });
}).then(function(users) {
  console.log(users);
})
```

### paginate(modelName, options)
Similar to select but accept size/page an convert to offset/limit

### selectOne(modelName, options)
Return only the first row.
```js
em.scope(function(db) {
  return db.select('User', { where: { roleId: [ 'in', [1, 2, 3] ] } });
}).then(function(user) {
  console.log(user);
})
```

### scalar(modelName, options)
Return the first cell value of first row.
```js
em.scope(function(db) {
  return db.scalar('User', { field: 'id', where: { id: 1 } });
}).then(function(userId) {
  console.log(userId);
})
```

### insert(modelName, data)
Insert a new row into table
```js
var user = { account: 'admin', firstName: 'Klesh', lastName: 'Wong' };

em.scope(function(db) {
  return db.insert('User', user);
}).then(function(insertedUser) {
  console.log(user.id); // 1
  console.log(insertedUser.id); // 1
  console.log(user === insertedUser); // true
})
```

### update(modelName, data, [where])
where can be:
  * undefined: update by primary keys which provided altogether within data
  * array/string: to pick up where values from data.
  * plain object: just like where parameter in select method
```js
// database user: { id: 1, firstName: 'Klesh', lastName: 'Wong' }
em.scope(function(db) {
  return db.update('User', { id: 1, firstName: 'Johnny' });
}).then(function() {
  return db.find('User', { id: 1 });
}).then(function(user) {
  console.log(user.firstName); // 'Johhny'
  console.log(user.lastName); // 'Wong'
})
```
Pass where to perform batch update.
```js
em.scope(function(db) {
  return db.update('User', { firstName: 'Johnny' }, { id: [ 'in', [1, 2, 3] ] });
}).then(function(affectedRows) {
  console.log(affectedRows); // 3
})

```

### upsert(modelName, data, [where])
Run update first, and if affected rows is zero then run a insert operation.

### save(modelName, data, [forceUpdate])
Validate and Insert/Update row base on AutoIncrement column's value if forceUpdate is omitted
```js
User.save({ nick: 'newUser' }); //insert
User.save({ lastLogonAt: moment(), id: 2 }); //update
```

### cell(modelName, columnName, cellValue, pkvalue)
Validate and Update a specific cell, useful when you apply EDIT IN PLACE pattern.
```js
User.cell('nick', 'NEWNICK', 2);
```

### Options reference

#### field
String: pass a string indicates to select a single column
Object: pass a Plain Object indicates to select columns as Alias (key as alias, value as column)
Array: pass a array indicates to select multiple columns
```js
User.select({ field: 'nick', where: { id: 1 } });
User.select({ field: [ 'id', 'nick' ] });
User.select({ field: { name: 'nick' } });
User.select({ field: [ 'id', { name: 'nick' } ] });
User.select({ field: { totalAge: em.sum('age'), avgAge: em.avg('age') } });
```

#### where
Object: pass a Object indicates an AND situation
```js
User.scalar({ field: em.count(), where: { age: [ '>', 20 ], departmentId: 1 } });
User.scalar({ field: em.avg('age'), where: { id: [ 'in', [1, 2, 3] ] } });
User.scalar({ field: em.avg('age'), where: { id: [ ['>', 20], 'OR', ['<', 10] ] } });
```

#### order
String: pass a string indicates to order by single column in ASC
Object: pass a Plain Object indicats to order by multiple columns
Array: pass a Array of String indicates to order by multiple columns in ASC
```js
User.select({ where: { departmentId: 1 }, order: 'id' });
User.select({ where: { departmentId: 1 }, order: { id: 'DESC', nick: 'ASC' } });
User.select({ where: { departmentId: 1 }, order: [ 'id', 'nick' ] });
```

#### offset
Number

#### limit
Number

#### groupby
String: group by single column

#### having
Object: same as where parameter

### Transaction

```js
var Promise = require('bluebird');

em.scope(function(db) {
  return db.query('BEGIN;').then(function() {
    return Promise.each([ 'user1', 'user2' ], function(name) {
      return db.inesrt('User', { name: name });
    })
  }).then(function() {
    return db.query('COMMIT;');  
  }).catch(function(err) {
    return db.query('ROLLBACK');
  });
})
```

### Complicated Query
JOIN clause is not supported currently, but you can perform your own query to achieve the goal.

Assuming one User belong
```js
em.scope(function(db) {
  return db.query('SELECT u.*, d."name" AS "departmentName" FROM "Users" u LEFT JOIN "Departments" d ON (u."departmentId" = d."id") WHERE u."id" = $1', [ userId ]);
}).then(function(user) {
  ...
})
```
query method also available in following manner (which essentially em.scope's shortcut):
```js
User.query('SELECT ....', [ parameter ])
```


## Model
em.define will return a Model constructor, which can be use to instantiate new instance, run validation and save to database.
```js
var User = em.define('User', { ... });
var user = new User({ nick: 'Klesh', roleId: 2 });
user.validate().then(function() {
  console.log('user is valid');
}).error(function(err) {
  console.log('user is invalid, %s, %s', err.propertyName, err.description);
})
```
Model contains has all Session operation as shortcut to default database, so you can do like:
```js
User.find({ id: 1 });
User.select({ field: ['id', 'nick'] });
User...
```
or in other database:
```js
User.findIn('other_database_name', { id: 1 })
User.selectIn('other_database', { field: [ 'id', 'nick' ] })
```

### Static Methods

#### saveIn(database, data, [forceUpdate]) --> Promise
Run validation and then trigger beforeUpdate/beforeInsert event, and then insert/update to specified DATABASE.
Return a rejected promise in beforeUpdate/beforeInsert can stop data being saved.
afterUpdate/afterInsert will be triggered if successful.

#### save(data, [forceUpdate]) --> Promise
Shortcut to DEFAULT DATABASE of saveIn

#### cellIn(database, field, value, pkvalue) --> Promise
Run validation and then trigger beforeCell event, and then Update specific cell's value in database.
Return a rejected promise in beforeCell can stop data being saved.
afterCell will be triggered if successful

#### cell(field, value, pkvalue) --> Promise
Shortcut to DEFAULT DATABASE of cellIn

#### allIn/insertIn/updateIn/deleteIn/selectIn/selectOneIn/findIn/scalarIn etc... --> Promise
Shortcuts to Session operations connect to specified database
```js
User.insertIn('db1', { nick: 'db1user' });
```

#### all/insert/update/delete/select/selectOne/find/scalar etc... --> Promise
Shortcuts to Session operations connect to DEFAULT DATABASE

#### fix(data, [names]) --> Promise
Convert specified properties into appropriate type, convert all when names is ommited

#### fixProperty(data, name) --> Promise
Convert specified property into appropriate type

#### fixValue(name, value) --> Promise
Convert specified property's value into appropriate type

#### validate(data, [names], forceUpdate) --> Promise
Validate specified properties, validate all when names is ommited
If Model have a autoIncrement column, this will run FULL or OWN PROPERTIES ONLY base on autoIncrement property's value. or you can pass forceUpdate as TRUE to force OWN PROPERTIES ONLY validation.

#### validateProperty(data, name) --> Promise
Validate specified property

#### validateValue(name, value) --> Promise
Validate specified property with value

### Instance Methods

#### fix([name|names]) --> Promise
Ommited: fix all properties
String: fix one property
Array: fix set of properties

#### validate([forceUpdate|name|names]) --> Promise
Ommited: validate all or partial properties base on AutoIncrement property's value
TRUE: validate Own Properties of current instance
String: validate one property
Array: validate specified properties


### Events
All events are defined as static property to Model, return value is optional
```js
User.onUpdateCell = function(field, value, id) {
  var user = User.find(id);
  if (user.disabled)
    return Promise.reject('User is disabled');
}
```

#### Model.beforeCell = function(field, value, id) --> Promise
Invoked between validation and save to database, return a rejected promise to stop saving

#### Model.afterCell = function(field, value, id) --> Promise
...

#### Model.beforeUpdate = function(data) --> Promise
...

#### Model.afterUpdate = function(data) --> Promise
...

#### Model.beforeInsert = function(data) --> Promise
...

#### Model.afterInsert = function(data) --> Promise
...

## Migration

Enter your project folder which had emmo-model installed then you can generate migration file
```base
$ cd myproject
$ em migrate MIGRATION_NAME
```
That will create a migration sql script file in myproject/migrations.
All migrations will be executed smartly by invoking sync().

## Notice
This is a very immature framework, pull requests and suggestion are gratefully welcome.
