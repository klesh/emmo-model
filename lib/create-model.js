var _ = require('lodash');

function Model(modelDef) {
  this._definition = modelDef;
}

Model.prototype.create = function(data) {
  
};

Model.prototype.validate = function() {

};

function createModel(modelDef) {

  function Model(data) {
    _.extend(this, data);
    this.rectify();
  }

  Model.prototype._definition = modelDef;

  Model.prototype.validate = function( ) {
  
  };

  Model.prototype.rectify = function(propertyName, propertyValue) {
    var self = this;
    _.each(this._definition.columns, function(columnDef) {
      
    });
  };

  Model.create = function(data) {
    var instance = new Model(data);
  };

  return Model;
}

module.exports = createModel;
