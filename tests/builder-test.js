"use strict";
/* jshint node: true */
/* jshint mocha: true */
var em = require('../index.js');
var Builder = require('../lib/builder.js');
var should = require('should');
var env = require('./env.js');

describe('SQL Query Builder Test', function() {
  if (env.dialect !== 'pg')
    return;

  em.init(env.configPath);

  it('INSERT STATEMENT', function() {
    var builder = new Builder(em, 'User');
    builder.insert({ nick: 'foo', passwordHash: 'abcd' });
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('INSERT INTO "Users" ("nick","password") VALUES ($1,$2) RETURNING "id"');
    should(builder.values).be.deepEqual([ 'foo', 'abcd' ]);
  });

  it('UPDATE STATEMENT', function() {
    var builder = new Builder(em, 'User');
    builder.update({ id: 1, age: em.o('age').plus(10) });
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('UPDATE "Users" SET "age"="age"+$1');
    should(builder.values).be.deepEqual([ 10 ]);

    builder.update({ age: 10 }, { id: [ 1, 2, 3 ] });
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('UPDATE "Users" SET "age"=$1 WHERE ("id" IN ($2,$3,$4))');
    should(builder.values).be.deepEqual([ 10, 1, 2, 3 ]);

    builder.update({ age: 10 }, { id: em.not(em.in([ 1, 2, 3 ])) });
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('UPDATE "Users" SET "age"=$1 WHERE ("id" NOT IN ($2,$3,$4))');
    should(builder.values).be.deepEqual([ 10, 1, 2, 3 ]);

    builder.update({ age: 10 }, { age: null });
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('UPDATE "Users" SET "age"=$1 WHERE ("age" IS NULL)');
    should(builder.values).be.deepEqual([ 10 ]);

    builder.update({ age: 10 }, { age: em.not(null) });
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('UPDATE "Users" SET "age"=$1 WHERE ("age" IS NOT NULL)');
    should(builder.values).be.deepEqual([ 10 ]);

    builder.update({ age: 10 }, { id: em.neq(12) });
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('UPDATE "Users" SET "age"=$1 WHERE ("id"<>$2)');
    should(builder.values).be.deepEqual([ 10, 12 ]);

    builder.update({ age: 10 }, { $A: [ { id: 10 }, { age: em.lt(10) } ], departmentId: 20 });
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('UPDATE "Users" SET "age"=$1 WHERE ((("id"=$2) OR ("age"<$3)) AND "departmentId"=$4)');
    should(builder.values).be.deepEqual([ 10, 10, 10, 20 ]);

    builder.update({ age: 10 }, [ { id: 10 }, { age: em.lt(10) } ]);
    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('UPDATE "Users" SET "age"=$1 WHERE (("id"=$2) OR ("age"<$3))');
    should(builder.values).be.deepEqual([ 10, 10, 10 ]);
  });

  it('DELETE STATEMENT', function() {
    var builder = new Builder(em, 'User');
    builder.delete({ id: 1 });

    //console.log(builder.sql, builder.values);
    should(builder.sql).be.exactly('DELETE FROM "Users" WHERE ("id"=$1)');
    should(builder.values).be.deepEqual([ 1 ]);
  });

  it('SELECT STATEMENT', function() {
    var builder = new Builder(em, 'User');
    builder.select();
    should(builder.sql).be.exactly('SELECT "id", "nick", "password" AS "passwordHash", "isAdmin", "age", "email", "departmentId", "createdAt", "updatedAt" FROM "Users"');
    should(builder.values).be.deepEqual([  ]);

    builder.select({ field: 'id' });
    should(builder.sql).be.exactly('SELECT "id" FROM "Users"');
    should(builder.values).be.deepEqual([  ]);

    builder.select({ field: em.count() });
    should(builder.sql).be.exactly('SELECT COUNT(*) FROM "Users"');
    should(builder.values).be.deepEqual([  ]);

    builder.select({ field: [ 'id', 'nick', 'passwordHash' ] });
    should(builder.sql).be.exactly('SELECT "id", "nick", "password" AS "passwordHash" FROM "Users"');
    should(builder.values).be.deepEqual([ ]);

    builder.select({ field: { userId: 'id', name: 'nick' }, where: { departmentId: 2 } });
    should(builder.sql).be.exactly('SELECT "id" AS "userId", "nick" AS "name" FROM "Users" WHERE ("departmentId"=$1)');
    should(builder.values).be.deepEqual([ 2 ]);

    builder.select({ field: ['*', 'Department.title'], join: 'Department' });
    should(builder.sql).be.exactly('SELECT "Users".*, "Departments"."title" FROM "Users" LEFT OUTER JOIN "Departments" ON ("Departments"."id"="Users"."departmentId")');
    should(builder.values).be.deepEqual([  ]);

    builder.select({ field: ['*', { 'department': 'Department.title' }], join: 'Department' });
    should(builder.sql).be.exactly('SELECT "Users".*, "Departments"."title" AS "department" FROM "Users" LEFT OUTER JOIN "Departments" ON ("Departments"."id"="Users"."departmentId")');
    should(builder.values).be.deepEqual([  ]);

    builder.select({ field: { userId: 'id', name: 'nick' } });
    should(builder.sql).be.exactly('SELECT "id" AS "userId", "nick" AS "name" FROM "Users"');
    should(builder.values).be.deepEqual([  ]);

    builder.select({ field: ['*', 'Department.title'], join: 'Department' });
    should(builder.sql).be.exactly('SELECT "Users".*, "Departments"."title" FROM "Users" LEFT OUTER JOIN "Departments" ON ("Departments"."id"="Users"."departmentId")');
    should(builder.values).be.deepEqual([  ]);

    builder.select({ as: 'u', field: [ 'id', 'nick', 'passwordHash', 'd.title' ], join: { d: 'Department' }, where: { 'd.title': 'Office' } });
    should(builder.sql).be.exactly('SELECT "u"."id", "u"."nick", "u"."password" AS "passwordHash", "d"."title" FROM "Users" "u" LEFT OUTER JOIN "Departments" "d" ON ("d"."id"="u"."departmentId") WHERE ("d"."title"=$1)');
    should(builder.values).be.deepEqual([ 'Office' ]);

    builder.select({ as: 'u', field: { userId: 'id', name: 'nick', department: 'b.title' }, join: { 'Department': { as: 'b', type: 'INNER' } } });
    should(builder.sql).be.exactly('SELECT "u"."id" AS "userId", "u"."nick" AS "name", "b"."title" AS "department" FROM "Users" "u" INNER JOIN "Departments" "b" ON ("b"."id"="u"."departmentId")');
    should(builder.values).be.deepEqual([ ]);

    builder.select({ as: 'u', join: { 'UserRole': { as: 'ur', type: 'INNER' }, "Role": { as: 'r', to: 'ur' } } });
    should(builder.sql).be.exactly('SELECT "u"."id", "u"."nick", "u"."password" AS "passwordHash", "u"."isAdmin", "u"."age", "u"."email", "u"."departmentId", "u"."createdAt", "u"."updatedAt" FROM "Users" "u" INNER JOIN "UserRoles" "ur" ON ("u"."id"="ur"."userId") LEFT OUTER JOIN "Roles" "r" ON ("r"."id"=ur."roleId")');
    should(builder.values).be.deepEqual([ ]);

    builder.select({ order: 'id' });
    should(builder.sql).be.exactly('SELECT "id", "nick", "password" AS "passwordHash", "isAdmin", "age", "email", "departmentId", "createdAt", "updatedAt" FROM "Users" ORDER BY "id"');
    should(builder.values).be.deepEqual([ ]);

    builder.select({ order: [ 'id', 'age' ] });
    should(builder.sql).be.exactly('SELECT "id", "nick", "password" AS "passwordHash", "isAdmin", "age", "email", "departmentId", "createdAt", "updatedAt" FROM "Users" ORDER BY "id", "age"');
    should(builder.values).be.deepEqual([ ]);

    builder.select({ order: { age: 'DESC', id: 'ASC' } });
    should(builder.sql).be.exactly('SELECT "id", "nick", "password" AS "passwordHash", "isAdmin", "age", "email", "departmentId", "createdAt", "updatedAt" FROM "Users" ORDER BY "age" DESC, "id"');
    should(builder.values).be.deepEqual([ ]);

    builder.select({ order: { age: 'DESC', id: 'ASC' }, offset: 10, limit: 5 });
    should(builder.sql).be.exactly('SELECT "id", "nick", "password" AS "passwordHash", "isAdmin", "age", "email", "departmentId", "createdAt", "updatedAt" FROM "Users" ORDER BY "age" DESC, "id" LIMIT $1 OFFSET $2');
    should(builder.values).be.deepEqual([ 5, 10 ]);
  });
});
