## emmo-model
Flexible lightweight orm framework, supports Structure Mirroring.

## Why?

   1.  Organize your model/table definition in one place.
   2.  Structure Mirroring feature, you can create multiple databases with same structure dynamically.
   2.  Create/Migrate databases automatically for you, you don't need to write a single line of SQL
   3.  Whenever you update your model, run `em migrate NAME` in your project folder, 
       a SQL file will be created accordingly, you can customize it, late on it will be applied
       to all databases smartly
   4.  You can `spawn` or `new` a new EmmoModel instance to connect to other Data Server or hold different Model set.
   5.  Data output from Database will be converted to proper type automatically.
   6.  Provide a very convenience way to accept input data from User.
   7.  Provide multiple styles to manipulate databases.
   8.  Support Incremental Update: `User.update({ 'age': em.o('age').plus(10) })`
   9.  Support Auto Join: `User.all({ field: [ '*', { department: 'Department.title' } ], join: 'Department' })`
   10. Support GroupBy/Having/Order/Offset/Limit/Pagination!
   11. WELL TESTED!

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

Sync database structure:
```bash
$ em sync
```

Rebase current model definition into database, this is useful when adapting to a legacy database,
you can run this command whenever model definitions are created accordingly:
```bash
$ em rebase
```

## Usage

### Step 1: Define models

Assume we have users in our system.
`myproject/models/user.js`

```js
var em = require('emmo-model');

var User = module.exports = em.define('User', {
  id: { type: 'bigint', autoIncrement: true, primaryKey: true }, // bigserial(postgres)
  account: { type: 'string', length: 50, allowNull: false, unique: true }, // varchar(50)
  passwordHash: { type: 'string', length: 50, input: false },
  firstName: { type: 'string', length: 50 },
  lastName: { type: 'string', length: 50 },
  email: { type: 'string', isEmail: true, message: 'Please enter valid email' },
  age: { type: 'int' },
  rank: { type: 'int' },
  remark: { type: 'string', defaultValue: "'text value should be quoted'" },
  createdAt: { type: 'timestamptz', defaultValue: 'now()', input: false } // timestamptz
}, { tableName: 'Users' });
```

Assume we need a role base access control machanism.
`myproject/models/role.js`

```js
var em = require('emmo-model');

var Role = module.exports = em.define('Role', {
  id: { type: 'int', autoIncrement: true, primaryKey: true },
  name: { type: 'string', length: 50, allowNull: false },
  permissions: { type: 'json' }
})
```

Then we need to make a Many-To-Mary relationship between user and role.
`myproject/models/user-role.js` 

```js
var em = require('emmo-model');

var UserRole = module.exports = em.define('UserRole' {
  userId: { type: 'bigint', refer: 'User', allowNull: false, onDelete: 'CASCADE', primaryKey: true }, 
  roleId: { type: 'int', refer: 'Role', allowNull: false, onDelete: 'CASCADE', primaryKey: true }, 
  disabled: { type: 'boolean' }
});
```

Assume we need to log down who and when created/disabled the UserRole relationship.
`myproject/models/user-role-log.js`

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
Here we refer to a composite primary key, emmo-model assumes that all columns refer same 
table are a composite foreign key

Assume we need to track down user's relationship
`myproject/models/relation.js`

```js
var em = require('emmo-model');

var Relation = module.exports = em.define('Relation', {
  userId: { type: 'bigint', refer: 'User', composite: 'FK_User_Relation_userId', onDelete: 'CASCADE', allowNull: false }, 
  relativeId: { type: 'bigint', refer: 'User', referName: true, onDelete: 'CASCADE', allowNull: false } 
  description: { type: 'string', length: 50 }
});
```
As you can see, `referName` is critical for tell whether it's a part of a composite key or not
either assign `true` to tell it's not a composite key or specify same `referName` for group of
columns to tell they are refering same composite primary key.


### Step 2: Bootstrap

Modify myproject/bin/www to bootstrap emmo-model before server start.

```js
var em = require('emmo-model');

em.sync().then(function() {
  server.listen(port)
});
```
`sync` method will CREATE or MIGRATE database automatically.


### Step 3: Here you go 

** ASSUME WE NEED A RESTful API **

#### Suggested Easy Way 
```js
var em = require('emmo-model');
var User = require('../models/user.js');

route.get('/', em.mount( req => User.all({ size:20, page: req.query.page }) ))
route.post('/', em.mount( req => User.input({ data: req.body, method: 'insert', before: user => user.passwordHash = ... }) ));
route.get('/:id', em.mount( req => User.find(req.params.id) ));
route.put('/:id', em.mount( req => User.input({ data: req.body, method: 'update' }) ));
route.delete('/:id', em.mount( req => User.delete({ id: req.params.id }) ));
```

#### Low Level Way:
```js
var _ = require('lodash');

route.get('/', function(req, res) {
  em.scope('db1', function(db) {
    return db.all('User', { 
      field: [ 'id', 'nick', 'age' ],
      where: { departmentId: em.lt(100) }, 
      order: { id : 'DESC' },
      limit: 20,
      offset: (req.query.page - 1) * 20
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
    res.json({ updatedFields: Object.keys(req.body) });
  });
});

route.delete('/:id', function(req, res) {
  em.scope('db1', function(db) {
    return db.delete('User', { id: req.params.id });
  }).then(function(affectedRows) {
    res.json({ affectedRows: affectedRows });
  });
});
```

Check out [Session](http://klesh.github.io/emmo-model/Session.html) to know more about operation methods


## Documentation

Check out [emmo-model](http://klesh.github.io/emmo-model/) for more document.


## Migration

Enter your project folder which had emmo-model installed then you can generate migration

```bash
$ cd myproject
$ em migrate MIGRATION_NAME
```

You can specify configuration file by --config like:
```bash
$ em migration MIGRATION_NAME --config em.dev.json
```

That will create a migration sql script file smartly for you, but you can still do some 
customization(like convert data of some sort). and then, you can either migrate your 
databases during app boostrap automatically, or run following command to migrate 
databases immediately:

```bash
$ em sync
```
