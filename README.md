# emmo-model.js
Lightweight/flexible orm framework, supports shadowing databases.

## Why?

   1. Organize your model/table definition in one place.
   2. Structure Mirroring feature, you can create multiple databases with same structure dynamically.
   2. Create databases automatically for you, you don't need to write a single line of SQL
   3. Whenever you update your model, run `em migrate NAME` in your project folder, 
      a SQL file will be created accordingly, you can customize it, late on it will be applied
      to all databases smartly
   4. You can `spawn` or `new` a new EmmoModel instance to connect to another Data Server or hold different Model set.
   5. Provide `fix` function to correct property data type base on definition.
   6. Provide `validate` function to run validation base on (Validator package)[https://www.npmjs.com/package/validator]
   7. Provide shortcut methods in Model as in static methods, as in you have only one database to work with.

## Installation

Install emmo-model-cli to help you generate necessary files

```bash
$ sudo npm install emmo-model-cli -g
```

Enter your project folder and install emmo-model and database connector(only pg available currently)

```bash
$ cd myproject
$ npm install emmo-model --save
$ npm install pg --save
$ em init
```
That would create `em.json` file, `models/` and `migrations/` folders in myproject/

## Usage

### Step 1: Define models

assume we have users in our system.
myproject/models/user.js

```js
var em = require('emmo-model');

var User = module.exports = em.define('User', {
  id: { type: 'bigint', autoIncrement: true, primaryKey: true }, // bigserial(postgres)
  account: { type: 'string', length: 50, allowNull: false, unique: true }, // varchar(50)
  firstName: { type: 'string', length: 50 },
  lastName: { type: 'string', length: 50 },
  email: { type: 'string', isEmail: true, message: 'Please enter valid email' },
  age: { type: 'int' },
  rank: { type: 'int' },
  remark: { type: 'string', defaultValue: "'text value should be quoted'" },
  createdAt: { type: 'timestamptz', defaultValue: 'now()' } // timestamptz
}, { tableName: 'Users' });
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
  userId: { type: 'bigint', refer: 'User', allowNull: false, onDelete: 'CASCADE', primaryKey: true }, 
  roleId: { type: 'int', refer: 'Role', allowNull: false, onDelete: 'CASCADE', primaryKey: true }, 
  disabled: { type: 'boolean' }
});
```

assume we need to log down who and when created/disabled the UserRole relationship.
myproject/models/user-role-log.js

```js
var em = require('emmo-model');

var UserRoleLog = module.exports = em.define('UserRoleLog', {
  id: { type: 'bigint', autoIncrement: true, primaryKey: true },
  userId: { type: 'bigint', refer: 'UserRole', allowNull: false, onDelete: 'CASCADE' },
  roleId: { type: 'int', refer: 'UserRole', allowNull: false, onDelete: 'CASCADE' },
  operator: { type: 'string', length: 50 },
  operation: { type: 'string' },
  createdAt: { type: 'timestamptz', defaultValue: 'now()' }
});
```
here we refer to a composite primary key, emmo-model assumes that all columns refer same 
table is a composite foreign key

assume we need to track down user's relationship
myproject/models/relation.js

```js
var em = require('emmo-model');

var Relation = module.exports = em.define('Relation', {
  userId: { type: 'bigint', refer: 'User', composite: 'FK_User_Relation_userId', onDelete: 'CASCADE', allowNull: false }, 
  relativeId: { type: 'bigint', refer: 'User', referName: true, onDelete: 'CASCADE', allowNull: false } 
  description: { type: 'string', length: 50 }
});
```
as you can see, `referName` is critical for tell whether it's a part of a composite key or not
either assign `true` to tell it's not a composite key or specify same `referName` for group of
columns to tell they are refering same composite primary key.


### Step 2: Bootstrap

modify myproject/bin/www to bootstrap emmo-model before server start.

```js
var em = require('emmo-model');

em.sync().then(function() {
  server.listen(port)
});
```
sync method will CREATE or MIGRATE database automatically.


### Step 3: Here you go

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
      where: { departmentId: em.lt(100) }, 
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

check out `Session` to know more about operation methods

## Documentation

check [emmo-model](http://emmo-model.github.io) for more document.

## Utils

### em.mount(handler)

an easy way to create JSON RESTful api
  1. All resolved result will be output in JSON format.
  2. All rejected result will be output in JSON format WITH a 400 bad request status code.

```js
var Promise2 = require('bluebird');
app.get('/user', em.mount(function(req, res) {
  return User.find(req.params.id);
}))
```


## Migration

Enter your project folder which had emmo-model installed then you can generate migration

```base
$ cd myproject
$ em migrate MIGRATION_NAME
```

That will create a migration sql script file smartly for you, but you can still do some 
customization(like convert data of some sort). and then, you can either migrate your 
databases during app boostrap automatically, or run following command to migrate 
databases immediately:

```bash
$ em sync
```
