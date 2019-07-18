'use strict';

const P = require('bluebird');
const fs = require('fs');

/**
 * Store databases that created by Emmo-Model
 */
class Store {
  constructor(em) {
    this.em = em;
    this.config = em.config;
    if (!Array.isArray(this.config.children)) {
      this.config.children = [];
    }
    this.children = this.config.children;
  }

  getChildren() {
    return P.resolve(this.children);
  }

  add(name) {
    var self = this;
    return this.exists(name).then(function(existing) {
      if (!existing) {
        self.children.push(name);
        return self._save();
      }
    });
  }

  remove(name) {
    var index = this.children.indexOf(name);
    if (index >= 0) {
      this.children.splice(index, 1);
      return this._save();
    }
    return P.resolve();
  }

  exists(name) {
    return P.resolve(this.children.indexOf(name) >= 0);
  }

  _save() {
    if (this.em.configPath) {
      var self = this;
      return new P(function(resolve, reject) {
        fs.writeFile(self.em.configPath, JSON.stringify(self.config, null, 2), function(err) {
          if (err)
            reject(err);
          else
            resolve();
        })
      })
    }
    return P.resolve();
  }
}

module.exports = Store;
