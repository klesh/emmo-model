'use strict';

const P = require('bluebird');

/**
 * @typedef {object} MigrationData
 * @property {string}   uid             a datetime string
 * @property {string}   name            migration name
 * @property {string}   fileName        sql script file name
 * @property {string}   script          full sql migration script, can be divided to 3 as following properties
 * @property {string}   scriptBefore    the part before CUSTOMIZE SCRIPT in full sql script
 * @property {string}   scriptCustomize the CUSTOMIZE SCRIPT in full sql script
 * @property {string}   scriptAfter     the part after CUSTOMIZE SCRIPT in full sql script
 * @property {funciton} exec            this exported funciton itself
 */
/**
 * exports a function who accepts two arguments to perform the migration.
 *
 * @param {Session}         db
 * @param {MigrationData}   migration
 * @return {Promise}
 */
module.exports = function(db, migration) {
  return P.each([
    db.query(migration.scriptBefore),
    beforeCustomize(db),
    db.query(migration.scriptCustomize),
    afterCustomize(db),
    db.query(migration.scriptAfter)
  ]);
};


function beforeCustomize(db) {
  // run before customize script
}

function afterCustomize(db) {
  // run after customize script 
}

