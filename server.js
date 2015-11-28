var express = require('express');
var bodyParser      = require('body-parser');
var dynamodb = require('./dynamodb');

var app = express();
var http = require('http').Server(app);

app.use(bodyParser.json());                                     // parse application/json
app.use(bodyParser.urlencoded({extended: true}));               // parse application/x-www-form-urlencoded
app.use(bodyParser.text());                                     // allows bodyParser to look at raw text
app.use(bodyParser.json({ type: 'application/vnd.api+json'}));  // parse application/vnd.api+json as json

var router = express.Router();

router.post('/tweet', function(req, res) {
	console.log('req body = ' + req.body);
	dynamodb.getTweet(req.body);
	res.status(200).end();
});

app.use('/', router);

var server = http.listen(process.env.PORT || 8888, function(){
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});