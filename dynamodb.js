var AWS = require('aws-sdk');
var config = require('./config');
var unirest = require('unirest');
var Twitter = require('twitter');
var _ = require('underscore');

AWS.config.update({
    accessKeyId: config.dynamodb.accessKeyId, 
    secretAccessKey: config.dynamodb.secretAccessKey,
    region: config.dynamodb.region});

var client = new Twitter({
    consumer_key: config.twitter.consumerKey,
    consumer_secret: config.twitter.consumerSecret,
    access_token_key: config.twitter.accessTokenKey,
    access_token_secret: config.twitter.accessTokenSecret
});

var dynamodb= {};

var docClient = new AWS.DynamoDB.DocumentClient();

var sns = new AWS.SNS({
    accessKeyId: config.dynamodb.accessKeyId, 
    secretAccessKey: config.dynamodb.secretAccessKey,
    region: config.dynamodb.region});

var extractTrends = function (trends) {
    var content = "";
    if(trends != null) {
        if(trends.trends != null) {
            _.each(trends.trends, function(trend) {
                if(trend != null && trend.name != null)
                    content += trend.name + ', ';
            });
        }
    }
    return content;
};

var getTrendsForWoeid = function(woeid, place) {
	console.log('place = ' + JSON.stringify(place));
	if(place.fetchTrends == 0) {
	    client.get('trends/place', {'id':woeid}, function (error, trends, response) {
	    	var content = "Top Trending: ";
	        if(error) {
	        	console.log('trends error = ' + JSON.stringify(error));
	        	content += JSON.stringify(error);
	        	place.fetchTrends = 0;
	        	place.trends = content;
	    	}
	        else if(trends != null && trends[0] != null) {
	            content += extractTrends(trends[0]);
	            place.fetchTrends = 1;
	        	place.trends = content;
	        }
	        putPlace(place);
	    });
	}
	else {
		putPlace(place);
	}
};

var getPlace = function (tweet) {
	docClient.get({
		Key: {'woeid': tweet.woeid},
		TableName: 'place_tbl'
	}, function(error, data){
    	if (error) console.log(error);
    	else {
    		var place = data.Item;
    		if(place != null) {
    			var tweetText = 'User: ' + tweet.userName 
    					+ '<br>Sentiment: ' 
						+ tweet.sentiment 
						+ '<br>Tweet: ' + tweet.text;
				var tweets = (place.tweets != null) ? place.tweets : "";
				tweets += '<br><br>' + tweetText;
				place.tweets = tweets;
				place.tweetCount = (place.tweetCount != null) ? (parseFloat(place.tweetCount) + 1) : 1;

				var positive = (place.positive != null) ? parseFloat(place.positive) : 0;
				place.positive = (tweet.sentiment == 'positive') ? (positive + 1) : positive;

				var negative = (place.negative != null) ? parseFloat(place.negative) : 0;
				place.negative = (tweet.sentiment == 'negative') ? (negative + 1) : negative;

				var neutral = (place.neutral != null) ? parseFloat(place.neutral) : 0;
				place.neutral = (tweet.sentiment == 'neutral') ? (neutral + 1) : neutral;

				var sentimenterror = (place.sentimenterror != null) ? parseFloat(place.sentimenterror) : 0;
				place.sentimenterror = (tweet.sentiment == 'daily-transaction-limit-exceeded') ? (sentimenterror + 1) : sentimenterror;
				place.x = tweet.x;
				place.y = tweet.y;
				getTrendsForWoeid(tweet.woeid, place);
    		}
    	} 
	});
};

var putPlace = function (place) {
	docClient.put({
		TableName: "place_tbl",
		Item: place
	}, function(error, data) {
		if (error) console.log('Error while storing place');
		else { 
			console.log('Sentiment stored = ' + data);
			sns.publish({
				TargetArn: 'arn:aws:sns:us-west-2:545137376042:tweet',
				Message: place.woeid
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

var getSetiment = function (text, tweet) {
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
  			tweet.sentiment = response.body.docSentiment.type;
  		} else {
  			console.log('Not able to compute sentiment');
  			tweet.sentiment = response.body.statusInfo;
  		}
  		getPlace(tweet);
  		deleteTweet(tweet.tweetId);
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