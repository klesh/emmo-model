# emmo-model v1.0.0
a lightweight orm framework, supports shadowing databases.

## INSTALLATION

Install emmo-model-cli to help you generate necessary files
```bash
$ sudo npm install emmo-model-cli -g
```

Enter your project folder and install emmo-model

```bash
$ cd myproject
$ npm install emmo-model --save
$ em init
```
That would create `em.json` file, `models/` and `migrations/` folders in myproject/

## Usage

### define model

myproject/models/user.js
```js
var em = require('emmo-model');

module.exports = em.define('User', {
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
myproject/models/role.js
```js
var em = require('emmo-model');

module.exports = em.define('Role', {
  id: { type: 'int', autoIncrement: true, primaryKey: true },
  name: { type: 'string', length: 50, allowNull: false }
})
```

### bootstrap
modify myproject/bin/www to bootstrap emmo-model before server start.
```js
var em = require('emmo-model');
em.init({ // will load from ./em.json if you invoke init() directly
  "modelsPath": "models",  // path of folder which contains all model definition files.
  "migrationsPath": "migrations",  // path of folder which contains all database migration sql files.
  "dialect": "pg", // dialect, current only postgres is available
  "connectionString": "/var/run/postgresql %s",  // leave %s as database name placehold, since em supports multiple databases sharing same structure.
  "database": "emtest", // a default database to develop on, to generate migration script. All spawn database will be exactly same as this one.
  "autoTrim": true, // trim string type value during validation automatically.
  "timestampFormat": "YYYY-MM-DD HH:mm:ss", // this will be passed to moment() directly, please check moment doc for detail.
  "dateFormat": "YYYY-MM-DD",
  "timeFormat": "HH:mm:ss"
})
em.createOrMigrate().then(function(isInitial) {
  if (isInitial) {
    em.scope(function(db) {
      return db.insert('User', { account: 'admin', password: 'hi' }); // insert a default admin user.
    })
  }
  server.listen(4000);
});
```

### CRUD
myproject/routes/index.js

For multiple databases:
```js
var em = require('emmo-model');
var _ = require('lodash');
var User = require('../models/user.js');

route.get('/', function(req, res) {
  em.scope('db1', function(db) {
    return db.paginate('User', { 
      field: [ 'id', 'nick', 'age' ],
      where: { departmentId: [ '<', 100 ] }, 
      order: { id : 'DESC' },
      size: 20,
      page: req.query.page
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

For single database:
```js
var User = require('../models/user.js');

route.get('/', function(req, res) {
  User.all().then(function (users) {
    res.json(user);
  });
})
```

## EmmoModel
A EmmoModel instance represent a set of Models. The major difference to other orm framework is that EmmoModel supports multiple databases sharing same set of Models.

### define(modelName, columnsDef, methodsDef) -> constructor
Define a new Model

### createOrMigrate() -> Promise
Create and initial database if it doesn't exists
```js
em.createOrMigrate().then(function(isCreate) {
  if (isCreate) {
    return em.scope(function(session) {
      // to insert initial data, like admin user..
    })
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
Create an empty database.

### remove(databaseName) -> Promise
Remove database.

### initial(databaseName) -> Promise
Run initial sql script on database to build up tables/indexes/foreignkeys according to Models definition.

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
Update model base on data's keys, 
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


## Model
em.define will return a Model constructor, which can be use to instantiate new instance, and run validation.
```js
var User = em.define('User', { ... });
var user = new User({ nick: 'Klesh', roleId: 2 });
user.validate().then(function() {
  console.log('user is valid');
}).error(function(err) {
  console.log('user is invalid, %s, %s', err.propertyName, err.description);
})
var result = user.validate();
if (result instanceof Error)
```
Model contains has all Session operation as shortcut to default database, so you can do like:
```js
User.find({ id: 1 });
User.select({ field: ['id', 'nick'] });
User...
```
### validate(forceUpdate) --> Promise
Run validation on current instance.
If Model have a autoIncrement column, this will run FULL or OWN PROPERTIES ONLY base on autoIncrement property's value. or you can pass forceUpdate as TRUE to force OWN PROPERTIES ONLY validation.


### validateProperty(propertyName) --> Promise
Run specify property validation on current instance.

### validateValue(propertyName, propertyValue) --> Promise
Run specify propertyName/propertyValue on current instance. Useful when you apply EDIT IN PLACE pattern.

### all/insert/update/delete/select/selectOne/find/scalar etc... --> Promise
Shortcuts to Session operations connect to DEFAULT DATABASE


## Migration

Enter your project folder which had emmo-model installed then you can generate migration file
```base
$ cd myproject
$ em migrate MIGRATION_NAME
```
That will create a migration sql script file in myproject/migrations.
All migrations will be executed smartly by invoking createOrMigrate().

## Notice
This is a very immature framework, pull requests and suggestion are gratefully welcome.
