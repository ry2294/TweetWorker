var AWS = require('aws-sdk');
var config = require('./config');
var unirest = require('unirest');

AWS.config.update({
    accessKeyId: config.dynamodb.accessKeyId, 
    secretAccessKey: config.dynamodb.secretAccessKey,
    region: config.dynamodb.region});

var dynamodb= {};

var docClient = new AWS.DynamoDB.DocumentClient();

var sns = new AWS.SNS({
    accessKeyId: config.dynamodb.accessKeyId, 
    secretAccessKey: config.dynamodb.secretAccessKey,
    region: config.dynamodb.region});

var putTweet = function (Item) {
	docClient.put({
		TableName: "tweet_tbl",
		Item: Item
	}, function(error, data) {
		if (error) console.log('Error while storing sentiment');
		else { 
			console.log('Sentiment stored = ' + data);
			sns.publish({
				TargetArn: 'arn:aws:sns:us-west-2:545137376042:tweet',
				Message: Item.tweetId
			}, function (error, data) {
				if (error) console.log('sns push failed. error = ' + error);
				else console.log('sns push succeeded. data = ' + JSON.stringify(data));
			});
		}
	});
};

var deleteTweet = function (tweetId) {
	docClient.delete({
		TableName: "tweet_tbl",
		Key: {
	        'tweetId': tweetId,
	    }
	}, function(error, data) {
		if (error) console.log('Error while deleting tweet');
		else console.log('Tweet deleted = ' + data)
	});
};

var getSetiment = function (text, Item) {
	var request = unirest.post('http://gateway-a.watsonplatform.net/calls/text/TextGetTextSentiment');
	request.header('Content-Type', 'application/x-www-form-urlencoded')
	.send('apikey=2a525c85bb4e0def466e9c7dce402e7fbc43ee49')
	.send(text)
	.send('outputMode=json')
	.send('showSourceText=1')
	.end(function (response) {
  		console.log(response.body);
  		if(response != null && 
  			response.body != null && 
  			response.body.docSentiment != null && 
  			response.body.docSentiment.type != null) {
  			Item.sentiment = response.body.docSentiment.type;
  			putTweet(Item);
  		} else {
  			console.log('Not able to compute sentiment');
  			Item.sentiment = response.body.statusInfo;
  			putTweet(Item);
  			//deleteTweet(Item.tweetId);
  		}
	});
};

dynamodb.getTweet = function (tweetId) {
	var getParams = {
	    Key: {
	        'tweetId': tweetId,
	    },
	    TableName: 'tweet_tbl'
	};
	docClient.get(getParams, function(error, data){
    	if (error) console.log(error);
    	else {
    		console.log(JSON.stringify(data));
    		getSetiment('text=' + data.Item.text, data.Item);
    	} 
	});
};

module.exports = dynamodb;