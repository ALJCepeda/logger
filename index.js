import _ from 'lodash';
import fs from 'fs';
import moment from 'moment';
import bluebird from 'bluebird';

const stat = bluebird.promisify(fs.stat);
const mkdir = bluebird.promisify(fs.mkdir);
const log = console.log;

const makeLogsDirectory = function(dir) {
  return mkdir(dir, '0740').catch((err) => {
    log(err);
    throw err;
  });
};

const initiateLogsDirectory = function(dir) {
  return stat(dir).catch((err) => {
    if(err.code === 'ENOENT') {
      return makeLogsDirectory(dir);
    } else {
      log('Unexpected error while stating logs directory:', err);
      throw err;
    }
  });
};

const onStreamError = function(streamName) {
  return (err) => {
    log(`${streamName} stream encountered error:`, err);
  };
};

const Logger = function(dir) {
  this.dir = dir || 'logs';
  this.errorCount = 0;
  this.accessCount = 0;

  this.errorStream = null;
  this.accessStream = null;
  this.consoleStream = null;
};

Logger.prototype.init = function() {
  return initiateLogsDirectory(this.dir).then(() => {
    this.errorStream = fs.createWriteStream('logs/error.log', { flags:'a' });
    this.accessStream = fs.createWriteStream('logs/access.log', { flags:'a' });
    this.consoleStream = fs.createWriteStream('logs/console.log', { flags:'a' });

    this.errorStream.on('error', onStreamError('Error'));
    this.accessStream.on('error', onStreamError('Access'));
    this.consoleStream.on('error', onStreamError('Console'));

    log('Created Log Streams, switching to logger');
    return true;
  });
};

Logger.prototype.timestamp = function() {
  return moment().format('MM-DD HHmm');
};

Logger.prototype.error = function() {
  const timestamp = this.timestamp();

  this.errorStream.write(`[${this.errorCount}]${timestamp} `);

  const args = Array.prototype.slice.call(arguments);
  args.forEach((arg) => {
    this.errorStream.write(arg);
  });

  this.errorStream.write(`\n----------------------------------------------------------------\n`);
  this.consoleStream.write(`[${this.errorCount}]${timestamp} Error encountered\n`);

  this.log(`[${this.errorCount}] Error`);
  this.errorCount++;
};

Logger.prototype.access = function (signature, req) {
  const timestamp = this.timestamp();
  const ip = req.connection.remoteAddress;

  this.accessStream.write(`[${this.accessCount}]${timestamp} (${signature}) ${ip}\n`);

  this.accessStream.write(JSON.stringify(req.params));
  this.accessStream.write(`\n`);

  this.accessStream.write(JSON.stringify(req.query));
  this.accessStream.write(`\n`);

  if(!_.isUndefined(req.body)) {
    this.accessStream.write(JSON.stringify(req.body));
    this.accessStream.write(`\n`);
  }

  this.log(`[${this.accessCount}] Access`);
  this.accessCount++;
};

Logger.prototype.log = function () {
  const timestamp = this.timestamp();
  this.consoleStream.write(`${timestamp} `);

  const args = Array.prototype.slice.call(arguments);
  args.forEach((arg) => {
    this.consoleStream.write(arg);
  });

  this.consoleStream.write(`\n`);

  args.unshift(`${timestamp}`);
  log.apply(null, args);
};

Logger.prototype.erroredRequest = function(err, req) {
  this.error(`Request errored: `, err.stack);

  if(req.params) {
    this.error(JSON.stringify(req.params));
  }

  if(req.body) {
    this.error(JSON.stringify(req.body));
  }
};

Logger.prototype.internalError = function(id, res) {
  return (err) => {
    this.error(`${id}: ${err}`);
    return res.status(500).send('This incident has been logged and will be fixed soon!');
  }
};


export default new Logger();
