var config = require('./config'),
    express = require('express'),
    morgan = require('morgan'),
    compress = require('compression'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    session = require('express-session'),
    http = require('http'),
    socketio = require('socket.io'),
    rna = require('../lib/rna.js');

module.exports = function() {
    var app = express(),
        server = http.createServer(app),
        io = socketio.listen(server);

    if (process.env.NODE_ENV === 'development') {
        app.use(morgan('dev'));
    } else if (process.env.NODE_ENV === 'production') {
        app.use(compress());
    }

    app.use(bodyParser.urlencoded({
        extended: true
    }));
    app.use(bodyParser.json());
    app.use(methodOverride());

    app.use(session({
        saveUninitialized: true,
        resave: true,
        secret: config.sessionSecret
    }));

    app.set('views', './app/views');
    app.set('view engine', 'ejs');

    require('../app/routes/index')(app);

    app.use(express.static('./public'));

    io.on('connection', function(socket){
          socket.on('loadPDB', function(pdbId) {
                var options = {
                  host: "files.rcsb.org",
                  port: 80,
                  path: '/view/'+ pdbId + ".pdb"
                };

                var request = http.request(options, function (res) {
                    var data = '',
                        chains = [];
                    res.on('data', function (chunk) {
                        data += chunk;
                    });
                    console.log(data)
                    res.on('end', function () {
                        var parser = new rna.parsers.StringParser();
                        parser.on('end', function(tertiaryStructures) {
                            tertiaryStructures.forEach(function(tertiaryStructure) {
                                chains.push(tertiaryStructure.rna.name);
                            });

                            socket.emit('gotPDB', pdbId, data, chains);
                        });
                        parser.parsePDB(data)
                    });
                });

                request.on('error', function (e) {
                    console.log(e.message);
                });
                request.end();

          });
    });

    return server;
};
