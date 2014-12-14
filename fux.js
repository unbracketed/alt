'use strict'

//import { Dispatcher } from 'flux'
//import { EventEmitter } from 'events'
//import { Promise } from 'es6-promise'
//import Symbol from './polyfills/es6-symbol'
//import assign from 'object-assign'
//import isPromise from 'is-promise'
//
//Object.assign = Object.assign || assign

var Dispatcher = require('flux').Dispatcher
var EventEmitter = require('events').EventEmitter
var Promise = require('es6-promise').Promise
var Symbol = require('./polyfills/es6-symbol')
Object.assign = Object.assign || require('object-assign')
var isPromise = require('is-promise')

var setState = Symbol('set state')
var symActionKey = Symbol('action key name')
var symListeners = Symbol('action listeners storage')
var symState = Symbol('state container')

class Store extends EventEmitter {
  constructor(dispatcher, store) {
    this[symListeners] = {}
    this[symState] = store.getInitialState()

    // A special setState method we use to bootstrap and keep state current
    this[setState] = (newState) => {
      if (this[symState] !== newState) {
        Object.assign(this[symState], newState)
      }
      this.emit('change')
    }

    // Register dispatcher
    this.dispatchToken = dispatcher.register((payload) => {
      if (this[symListeners][payload.action]) {
        var state = this[symListeners][payload.action](payload.data)

        if (isPromise(state)) {
          state.then((data) => this[setState](data))
        } else {
          this[setState](state)
        }
      }
    })

    // Transfer over the listeners
    store.listeners && Object.keys(store.listeners).forEach((listener) => {
      this[symListeners][listener] = store.listeners[listener]
    })
    store.listeners = {}
  }

  emitChange() {
    this.emit('change')
  }

  listen(cb) {
    this.on('change', cb)
  }

  unlisten(cb) {
    this.removeListener('change', cb)
  }

  getState() {
    // Copy over state so it's RO.
    return Object.assign({}, this[symState])
  }
}

var symDispatch = Symbol('dispatch action')
var symHandler = Symbol('action creator handler')

class ActionCreator {
  constructor(dispatcher, name, action) {
    this.name = name
    this.action = action

    this[symHandler] = (...args) => {
      var value = this.action.apply(this, args)
      if (isPromise(value)) {
        value.then((data) => this[symDispatch](data))
      } else {
        this[symDispatch](value)
      }
    }

    this[symDispatch] = (data) => {
      dispatcher.dispatch({
        action: this.name,
        data: data
      })
    }
  }
}

var ActionListeners = {
  listeners: {},

  listenTo(symbol, handler) {
    if (symbol[symActionKey]) {
      this.listeners[symbol[symActionKey]] = handler
    } else {
      this.listeners[symbol] = handler
    }
  },

  listenToActions(actions) {
    Object.keys(actions).forEach((action) => {
      var symbol = actions[action]
      var assumedEventHandler = action.replace(
        /./,
        (x) => 'on' + x[0].toUpperCase()
      )
      if (this[assumedEventHandler]) {
        if (symbol[symActionKey]) {
          this.listeners[symbol[symActionKey]] = this[assumedEventHandler]
        } else {
          this.listeners[symbol] = this[assumedEventHandler]
        }
      }
    })
  }
}

var formatAsConstant = (name) => {
  return name.replace(/[a-z]([A-Z])/g, (i) => {
    return i[0] + '_' + i[1].toLowerCase()
  }).toUpperCase()
}

var symStores = Symbol('stores storage')

class Fux {
  constructor() {
    this.dispatcher = new Dispatcher()
    this[symStores] = {}
  }

  createStore(StoreModel) {
    Object.assign(StoreModel.prototype, ActionListeners)
    var key = StoreModel.displayName || StoreModel.name
    var store = new StoreModel()
    return this[symStores][key] = new Store(this.dispatcher, store)
  }

  createActions(actions) {
    return Object.keys(actions).reduce((obj, action) => {
      var constant = formatAsConstant(action)
      var actionName = Symbol('action ' + constant)

      var newAction = new ActionCreator(
        this.dispatcher,
        actionName,
        actions[action]
      )

      obj[action] = newAction[symHandler]
      obj[action][symActionKey] = actionName
      obj[constant] = actionName

      return obj
    }, {})
  }

  takeSnapshot() {
    return JSON.stringify(Object.keys(this[symStores]).reduce((obj, key) => {
      obj[key] = this[symStores][key].getState()
      return obj
    }, {}))
  }

  bootstrap(data) {
    var obj = JSON.parse(data)
    Object.keys(obj).forEach((key) => {
      this[symStores][key][setState](obj[key])
    })
  }
}

Fux.Promise = Promise

Fux.id = (x) => x

module.exports = Fux