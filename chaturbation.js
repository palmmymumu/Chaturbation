const async = require('async');
const request = require('request');
const cheerio = require('cheerio');
const childProcess = require('child_process');
const mkdirp = require('mkdirp');
const fs = require('fs');

var capturing = [];

mkdirp.sync('capturing/');
mkdirp.sync('captured/');
run();

function run() {
  setTimeout(run, 180000);
  getUsers('https://chaturbate.com/couple-cams/', (err, users) => {
    if (err)
      return console.log(err);

    async.eachLimit(users, 10, (user, cb) => {
      if (capturing.indexOf(user) >= 0) return cb();
      getUserDetail(user, (err, userDetail) => {
        if (err) {
          console.log(user, 'An error occured: ' + err);
          return cb();
        }

        if (userDetail.hls_source && userDetail.hls_source != '')
          startCapture(user, user + '_' + Date.now(), userDetail.hls_source);

        cb();
      });
    });
  });
}

function getUsers(url, cb) {
  request(url, (err, response, body) => {
    if (err || response.statusCode != 200) {
      cb(err);
      return;
    }

    var $ = cheerio.load(body),
      users = [];
    $('div.details > div.title').each((index, elem) => {
      users.push($(elem).find('a').first().attr('href').replace(/\//g, ''));
    })

    cb(null, users);
  })
}

function getUserDetail(user, cb) {
  request('https://chaturbate.com/api/chatvideocontext/' + user, (err, response, body) => {
    if (err || response.statusCode != 200) {
      cb(err);
      return;
    }

    cb(null, JSON.parse(body));
  })
}

function startCapture(user, filename, url) {
  if (capturing.indexOf(user) >= 0) return;

  var captureProcess = childProcess.spawn('ffmpeg', [
    '-hide_banner',
    '-v',
    'fatal',
    '-i',
    url,
    '-c',
    'copy',
    '-vsync',
    '2',
    '-r',
    '60',
    '-b:v',
    '500k',
    'capturing/' + filename + '.ts'
  ]);

  if (captureProcess.pid) {
    console.log(user, 'Start recording...');
    capturing.push(user);
  }

  captureProcess.on('close', () => {
    fs.stat('capturing/' + filename + '.ts', (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          console.log(user, filename + '.ts not found in capturing directory, cannot convert to .mp4');
        } else {
          console.log(user, err.toString());
        }
        capturing.splice(capturing.indexOf(user), 1);
      } else {
        postProcess(user, filename);
      }
    });
  });

  captureProcess.on('error', (err) => {
    console.log(user, 'Error occured while capturing file ' + filename + '.ts (' + err + ')');
    capturing.splice(capturing.indexOf(user), 1);
  });

}

function postProcess(user, filename) {
  mkdirp.sync('captured/' + user);
  var convertProcess = childProcess.spawn('ffmpeg', [
    '-hide_banner',
    '-v',
    'fatal',
    '-i',
    'capturing/' + filename + '.ts',
    '-c',
    'copy',
    '-bsf:a',
    'aac_adtstoasc',
    '-copyts',
    'captured/' + user + '/' + filename + '.mp4'
  ]);

  if (convertProcess.pid) {
    console.log(user, filename + '.ts start converting...');
  }

  convertProcess.on('close', () => {
    fs.unlinkSync('capturing/' + filename + '.ts');
    console.log(user, filename + '.mp4 done converting!');
    capturing.splice(capturing.indexOf(user), 1);
  });

  convertProcess.on('error', (err) => {
    console.log(user, 'Error occured while converting file ' + filename + '.mp4 (' + err + ')');
    capturing.splice(capturing.indexOf(user), 1);
  });
}
